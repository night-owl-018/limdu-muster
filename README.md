# Division Muster

> Self-hosted daily muster tracker for Navy divisions. Runs on Unraid, accessible from any browser over Tailscale.

![Node.js](https://img.shields.io/badge/Node.js-20-green?logo=node.js) ![Docker](https://img.shields.io/badge/Docker-ready-blue?logo=docker) ![License](https://img.shields.io/badge/license-MIT-lightgrey)

---

## What it does

- Track up to 120+ personnel across multiple sections
- 14 status codes with dropdown selection per person
- Add notes per member — return dates, verifier info, contact times
- Bulk import your entire roster by pasting from any spreadsheet
- Auto-generates a copy-ready muster report block
- All data saved to a JSON file on your server — survives reboots

---

## Requirements

- Unraid server with Docker enabled
- Tailscale installed on Unraid (for remote access)
- 5 minutes

---

## Deploy on Unraid

### 1. Open the Unraid terminal

In the Unraid web UI go to **Tools → Terminal**.

### 2. Clone the repo

```bash
cd /mnt/user/appdata
git clone https://github.com/YOUR_USERNAME/division-muster.git
cd division-muster
```

When prompted, enter your GitHub username. For the password, use a **personal access token** — not your GitHub password.

> **To create a token:** GitHub → Profile picture → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token → check `repo` → Generate → copy it.

### 3. Build the image

```bash
docker build -t division-muster .
```

Takes about 60 seconds. Only needed once, or after an update.

### 4. Run the container

```bash
docker run -d \
  --name division-muster \
  --restart unless-stopped \
  -p 3456:3000 \
  -v /mnt/user/appdata/division-muster-data:/data \
  -e DATA_FILE=/data/muster.json \
  division-muster
```

### 5. Open it

| Network | URL |
|---|---|
| Home / local | `http://UNRAID-IP:3456` |
| Tailscale (anywhere) | `http://UNRAID-TAILSCALE-IP:3456` |

No install needed on the device opening it — any browser works, including NMCI machines over Tailscale.

---

## Updating

```bash
cd /mnt/user/appdata/division-muster
git pull
docker stop division-muster && docker rm division-muster
docker build -t division-muster .
docker run -d \
  --name division-muster \
  --restart unless-stopped \
  -p 3456:3000 \
  -v /mnt/user/appdata/division-muster-data:/data \
  -e DATA_FILE=/data/muster.json \
  division-muster
```

Your data is in `/mnt/user/appdata/division-muster-data/muster.json` and is never touched during updates.

---

## Bulk import format

In the **Manage roster** tab, paste your roster one person per line. Columns separated by commas or tabs.

```
SMITH, JOHN A, STG2, 1, SONAR
JONES, MARY B, STG1, 1, SONAR
BROWN, ERIC T, STGC, 2, TRNG
DAVIS, ANN R, STG3, 2, TRNG
```

Format: `Name, Rate, Section, Work Center`

---

## Status codes

| Code | Meaning |
|---|---|
| `PRESENT` | Physically present at muster |
| `PHONE` | Voice contact verified, not physically present |
| `TEXT` | Text contact with daily code, not physically present |
| `APPT` | Medical, dental, or admin appointment |
| `SICK CALL` | At sick call |
| `SIQ` | Sick in quarters |
| `LIGHT DUTY` | On light duty, reported to work center |
| `LEAVE` | On approved leave |
| `TAD` | Temporary additional duty |
| `SCHOOL` | In a school or training course |
| `WATCH` | Standing watch |
| `POST-WATCH` | Authorized post-watch rest |
| `LIBERTY` | On authorized liberty |
| `UA` | Unauthorized absence — report immediately |

---

## Data and privacy

- Data lives at `/mnt/user/appdata/division-muster-data/muster.json` on your Unraid server
- Keep the app behind Tailscale — do not expose port 3456 to the public internet
- Do not record medical details — use `APPT` as the status only
- This file is CUI once populated with real personnel data

---

## License

MIT
