#!/bin/sh
# This script creates 25 test users with popular anime character names.
# The backend service must be running.

echo "Creating anime character users..."

curl -X POST http://localhost:8000/auth/register -H "Content-Type: application/json" -d '{"name": "Son Goku", "email": "son.goku@anime.com", "password": "12345"}'
curl -X POST http://localhost:8000/auth/register -H "Content-Type: application/json" -d '{"name": "Vegeta", "email": "vegeta@anime.com", "password": "12345"}'
curl -X POST http://localhost:8000/auth/register -H "Content-Type: application/json" -d '{"name": "Naruto Uzumaki", "email": "naruto.uzumaki@anime.com", "password": "12345"}'
curl -X POST http://localhost:8000/auth/register -H "Content-Type: application/json" -d '{"name": "Sasuke Uchiha", "email": "sasuke.uchiha@anime.com", "password": "12345"}'
curl -X POST http://localhost:8000/auth/register -H "Content-Type: application/json" -d '{"name": "Monkey D. Luffy", "email": "monkey.d.luffy@anime.com", "password": "12345"}'
curl -X POST http://localhost:8000/auth/register -H "Content-Type: application/json" -d '{"name": "Roronoa Zoro", "email": "roronoa.zoro@anime.com", "password": "12345"}'
curl -X POST http://localhost:8000/auth/register -H "Content-Type: application/json" -d '{"name": "Ichigo Kurosaki", "email": "ichigo.kurosaki@anime.com", "password": "12345"}'
curl -X POST http://localhost:8000/auth/register -H "Content-Type: application/json" -d '{"name": "Light Yagami", "email": "light.yagami@anime.com", "password": "12345"}'
curl -X POST http://localhost:8000/auth/register -H "Content-Type: application/json" -d '{"name": "L Lawliet", "email": "l.lawliet@anime.com", "password": "12345"}'
curl -X POST http://localhost:8000/auth/register -H "Content-Type: application/json" -d '{"name": "Edward Elric", "email": "edward.elric@anime.com", "password": "12345"}'
curl -X POST http://localhost:8000/auth/register -H "Content-Type: application/json" -d '{"name": "Alphonse Elric", "email": "alphonse.elric@anime.com", "password": "12345"}'
curl -X POST http://localhost:8000/auth/register -H "Content-Type: application/json" -d '{"name": "Eren Yeager", "email": "eren.yeager@anime.com", "password": "12345"}'
curl -X POST http://localhost:8000/auth/register -H "Content-Type: application/json" -d '{"name": "Mikasa Ackerman", "email": "mikasa.ackerman@anime.com", "password": "12345"}'
curl -X POST http://localhost:8000/auth/register -H "Content-Type: application/json" -d '{"name": "Levi Ackerman", "email": "levi.ackerman@anime.com", "password": "12345"}'
curl -X POST http://localhost:8000/auth/register -H "Content-Type: application/json" -d '{"name": "Saitama", "email": "saitama@anime.com", "password": "12345"}'
curl -X POST http://localhost:8000/auth/register -H "Content-Type: application/json" -d '{"name": "Genos", "email": "genos@anime.com", "password": "12345"}'
curl -X POST http://localhost:8000/auth/register -H "Content-Type: application/json" -d '{"name": "Spike Spiegel", "email": "spike.spiegel@anime.com", "password": "12345"}'
curl -X POST http://localhost:8000/auth/register -H "Content-Type: application/json" -d '{"name": "Jotaro Kujo", "email": "jotaro.kujo@anime.com", "password": "12345"}'
curl -X POST http://localhost:8000/auth/register -H "Content-Type: application/json" -d '{"name": "Joseph Joestar", "email": "joseph.joestar@anime.com", "password": "12345"}'
curl -X POST http://localhost:8000/auth/register -H "Content-Type: application/json" -d '{"name": "Giorno Giovanna", "email": "giorno.giovanna@anime.com", "password": "12345"}'
curl -X POST http://localhost:8000/auth/register -H "Content-Type: application/json" -d '{"name": "Killua Zoldyck", "email": "killua.zoldyck@anime.com", "password": "12345"}'
curl -X POST http://localhost:8000/auth/register -H "Content-Type: application/json" -d '{"name": "Gon Freecss", "email": "gon.freecss@anime.com", "password": "12345"}'
curl -X POST http://localhost:8000/auth/register -H "Content-Type: application/json" -d '{"name": "Sailor Moon", "email": "sailor.moon@anime.com", "password": "12345"}'
curl -X POST http://localhost:8000/auth/register -H "Content-Type: application/json" -d '{"name": "Lelouch Lamperouge", "email": "lelouch.lamperouge@anime.com", "password": "12345"}'
curl -X POST http://localhost:8000/auth/register -H "Content-Type: application/json" -d '{"name": "Asuka Langley Soryu", "email": "asuka.langley.soryu@anime.com", "password": "12345"}'

echo "Finished creating users."
