# Kubernetes Deployment Guide (VPS + Cloudflare)

This document explains how to deploy PeladaApp to a Kubernetes cluster running on a standalone VPS using **K3s** and **Cloudflare Tunnels**.

## 🏗️ Architecture Overview

- **K3s**: A lightweight Kubernetes distribution perfect for a single VPS.
- **Cloudflare Tunnel (`cloudflared`)**: Creates a secure, outbound-only bridge between your cluster and Cloudflare. This means your VPS firewall can remain **completely closed** (no ports 80/443 open).
- **Ansible**: Used for the initial server provisioning and K3s installation.
- **GHCR**: Private images are pulled from the GitHub Container Registry.

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

**What this does:** Installs K3s (without Traefik), secures the OS, and downloads a `k3s-vps.yaml` file to your local machine.

---

## 🔐 Step 2: Cluster Connectivity & Secrets

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
    - Open `k8s/manifests/01-secrets-template.yaml`.
    - Fill in all the `replace_with_...` fields (Database URLs, SMTP keys, and your **Cloudflare Tunnel Token**).
    - Save it as `k8s/manifests/01-secrets.yaml` (this file is git-ignored for safety).

---

## 🌐 Step 3: Domain Configuration

1.  Open `k8s/manifests/08-cloudflared.yaml`.
2.  Update the `hostname` field (e.g., `pelada.yourdomain.com`) to match your actual domain.
3.  Open `k8s/manifests/01-secrets.yaml` and ensure `FRONTEND_URL` matches the same domain.

---

## 🚢 Step 4: Deploying the Stack

Apply all manifests in order:

```bash
kubectl apply -f k8s/manifests/
```

### Order of operations:
1.  **Namespace & Secrets**: Sets the stage.
2.  **Persistent Volumes**: Reserves disk space on your VPS for Postgres and uploads.
3.  **Postgres (StatefulSet)**: Starts the database.
4.  **Workloads (Backend, Frontend, WAHA)**: Starts the application services.
5.  **Cloudflared**: Creates the tunnel to the internet.

---

## 🛠️ Maintenance & Monitoring

- **Check Logs**: `kubectl logs -n peladaapp -l app=backend`
- **View Pods**: `kubectl get pods -n peladaapp`
- **Restart App**: `kubectl rollout restart deployment/backend -n peladaapp`
- **Storage Location**: By default, data is stored on the VPS at `/var/lib/rancher/k3s/storage/`.

## 🔄 Updating the App

When you push a new version to GHCR, update the deployment:
```bash
kubectl rollout restart deployment/backend -n peladaapp
kubectl rollout restart deployment/frontend -n peladaapp
```
*(Tip: This can be automated in GitHub Actions as a final step in your `deploy.yml` workflow).*
