# Kubernetes Deployment Guide (VPS + Cloudflare)

This document explains how to deploy PeladaApp to a Kubernetes cluster running on a standalone VPS using **K3s** and **Cloudflare Tunnels**.

## 🏗️ Architecture Overview

- **K3s**: A lightweight Kubernetes distribution perfect for a single VPS.
- **Cloudflare Tunnel (`cloudflared`)**: Creates a secure, outbound-only bridge between your cluster and Cloudflare. This means your VPS firewall can remain **completely closed** (no ports 80/443 open).
- **Ansible**: Used for the initial server provisioning and K3s installation.
- **GHCR**: Private images are pulled from the GitHub Container Registry.
- **Host-Native Postgres**: We use the Postgres instance installed directly on the VPS for better performance and simplicity.

---

## 🛠️ Prerequisites

Before you begin, ensure you have the following installed on your **local machine**:
- **Ansible**: To run the server provisioning playbook. ([Installation Guide](https://docs.ansible.com/ansible/latest/installation_guide/intro_installation.html))
- **kubectl**: To interact with the Kubernetes cluster once it is created. ([Installation Guide](https://kubernetes.io/docs/tasks/tools/))

---

## 🚀 Step 1: Server Provisioning (Ansible)

First, you need to turn your bare VPS into a Kubernetes cluster.

1.  Navigate to the Ansible directory:
    ```bash
    cd k8s/ansible
    ```
2.  Create your inventory file:
    ```bash
    cp inventory.ini.template inventory.ini
    ```
3.  Edit `inventory.ini` with your VPS IP and SSH user.
4.  Run the playbook:
    ```bash
    ansible-playbook -i inventory.ini playbook.yml
    ```

**What this does:** Installs K3s (without Traefik), secures the OS, enables the `host.k3s.internal` resolver, and downloads a `k3s-vps.yaml` file to your local machine.

---

## 🗄️ Step 2: Database Setup (Host-Native Postgres)

Configure your VPS Postgres to allow connections from the Kubernetes internal network.

1.  **Update `postgresql.conf`**:
    Edit `/etc/postgresql/15/main/postgresql.conf` (or your version) and ensure it listens to all interfaces:
    ```ini
    listen_addresses = '*'
    ```

2.  **Update `pg_hba.conf`**:
    Allow the K3s pod network (default is `10.42.0.0/16`):
    ```text
    # Add this at the end of /etc/postgresql/15/main/pg_hba.conf
    host    all             all             10.42.0.0/16            scram-sha-256
    ```

3.  **Restart Postgres**:
    ```bash
    sudo systemctl restart postgresql
    ```

---

## 🔐 Step 3: Cluster Connectivity & Secrets

1.  **Configure `kubectl`**:
    Point your local terminal to the new cluster:
    ```bash
    export KUBECONFIG=$(pwd)/k8s/k3s-vps.yaml
    kubectl get nodes # Should show your VPS as Ready
    ```

2.  **GitHub Registry Access**:
    Kubernetes needs permission to pull your private images from GHCR. Create a Personal Access Token (PAT) with `read:packages` scope and run:
    ```bash
    kubectl create namespace peladaapp
    kubectl create secret docker-registry ghcr-login \
      --namespace peladaapp \
      --docker-server=https://ghcr.io \
      --docker-username=YOUR_GITHUB_USERNAME \
      --docker-password=YOUR_GITHUB_PAT_TOKEN
    ```

3.  **Application Secrets**:
    - Copy the template: `cp k8s/manifests/01-secrets-template.yaml k8s/manifests/01-secrets.yaml`
    - Open `k8s/manifests/01-secrets.yaml`.
    - Fill in all the `replace_with_...` fields and update the fake database credentials.
    - **Note:** Ensure you use `10.42.0.1` (the default K3s host gateway) in your `DATABASE_URL` (e.g., `jdbc:postgresql://10.42.0.1:5432/peladaapp?user=...`).

---

## 🌐 Step 4: Domain & Tunnel Configuration

1.  Open `k8s/manifests/01-secrets.yaml` and ensure `FRONTEND_URL` matches your actual domain (e.g., `https://pelada.yourdomain.com`).
2.  Configure public hostnames inside your **Cloudflare Zero Trust Dashboard** for the corresponding tunnels (Tunnel 1 and Tunnel 2). Since the tunnels are run using tokens, Cloudflare manages the routing at the edge:
    - **For the application tunnel (Tunnel 1 / `cloudflared-tunnel-1`)**:
      - Add a public hostname: `pelada.yourdomain.com`
      - Map it to the internal service: `http://frontend.peladaapp.svc.cluster.local:8080` (this routes traffic to the Nginx frontend inside the Kubernetes namespace `peladaapp`).
    - **For the management tunnel (Tunnel 2 / `cloudflared-tunnel-2`)**:
      - **WAHA Dashboard**: Add a public hostname (e.g., `waha.yourdomain.com`) and map it to `http://waha.peladaapp.svc.cluster.local:3000`.
      - **Portainer (Optional)**: Add a public hostname (e.g., `portainer.yourdomain.com`) and map it to `http://portainer.portainer.svc.cluster.local:9000`.

---

## 🚢 Step 5: Deploying the Stack

Apply all manifests in order:

```bash
kubectl apply -f k8s/manifests/
```

### Order of operations:
1.  **Namespace & Secrets**: Sets the stage.
2.  **Persistent Volumes**: Reserves disk space on your VPS for uploads and WAHA data.
3.  **Workloads (Backend, Frontend, WAHA)**: Starts the application services.
4.  **Frontend Config**: Injects the Nginx routing logic for the single-domain setup.
5.  **Cloudflared**: Creates the tunnel to the internet.

---

## 🛠️ Maintenance & Monitoring

- **Check Logs**: `kubectl logs -n peladaapp -l app=backend`
- **View Pods**: `kubectl get pods -n peladaapp`
- **Restart App**: `kubectl rollout restart deployment/backend -n peladaapp`
- **Storage Location**: By default, data is stored on the VPS at `/var/lib/rancher/k3s/storage/`.

## 🔄 Updating the App

### Automated Updates (Keel)
This cluster uses **Keel** to automatically update your application when a new image is published to GHCR.
- By default, Keel is configured to **poll the registry every 1 hour** (`@every 1h` in the deployment annotations).
- If Keel detects a new image digest for the `latest` tag, it will automatically roll out the new pods.

### Manual / Immediate Updates
If you push a critical fix and do not want to wait for Keel's next hourly poll, you can force Kubernetes to pull the latest images and restart the pods immediately by running:
```bash
kubectl rollout restart deployment/backend -n peladaapp
kubectl rollout restart deployment/frontend -n peladaapp
```
