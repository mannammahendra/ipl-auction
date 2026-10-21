# 🏏 IPL Mega Auction — Multiplayer Real-Time Platform

A production-grade, server-authoritative multiplayer web application designed to simulate the high-stakes drama of the **IPL Mega Auction** with friends.

Built with **Next.js 14**, **NestJS**, **WebSockets (Socket.IO)**, **Prisma ORM**, and **Tailwind CSS**.

---

## 🌟 Key Highlights & Features

- **Server-Authoritative Auction Engine**:
  - All bid validation, timer ticks, purse calculations, and hammer drops happen exclusively on the server.
  - Zero client-side trust: protects against devtool manipulation, double-clicks, and network racing.
- **Atomic Concurrency & Anti-Sniping Protection**:
  - Mutex locks per room guarantee atomic processing of simultaneous bids from multiple players.
  - Automatic timer extension (+10s) whenever a bid is made in the closing seconds to eliminate sniping.
- **Strict IPL Roster & Purse Reservation Rules**:
  - Squad limits: Enforces minimum (18) and maximum (25) players.
  - Overseas quota: Strictly enforces maximum 8 overseas players per franchise.
  - **Reserve Purse Calculation**: Prevents teams from over-spending by ensuring they always reserve enough purse to fill the remaining mandatory squad spots at minimum base price (₹30 Lakhs per spot).
- **IPL Dynamic Bid Increment Ladder**:
  - Base price opening: First bid is exact player base price.
  - `< ₹1.00 Cr`: +₹5 Lakhs minimum increment.
  - `₹1.00 Cr – ₹2.00 Cr`: +₹10 Lakhs minimum increment.
  - `₹2.00 Cr – ₹5.00 Cr`: +₹20 Lakhs minimum increment.
  - `≥ ₹5.00 Cr`: +₹25 Lakhs / +₹50 Lakhs increment.
- **10 Official IPL Franchises Pre-loaded**:
  - Chennai Super Kings (CSK) 🦁
  - Mumbai Indians (MI) 🌀
  - Royal Challengers Bengaluru (RCB) 👑
  - Kolkata Knight Riders (KKR) ⚔️
  - Sunrisers Hyderabad (SRH) 🦅
  - Rajasthan Royals (RR) 🏰
  - Gujarat Titans (GT) ⚡
  - Lucknow Super Giants (LSG) 🪁
  - Delhi Capitals (DC) 🐯
  - Punjab Kings (PBKS) 🦁
- **Rich Seed Database with 40+ Top IPL Superstars**:
  - Marquee: Virat Kohli, Jasprit Bumrah, Rohit Sharma, Pat Cummins, Heinrich Klaasen, Travis Head, Rashid Khan, Jos Buttler, Rishabh Pant, Hardik Pandya, Suryakumar Yadav, Mitchell Starc.
  - Capped & Uncapped Batsmen, All-rounders, Bowlers, Wicketkeepers with authentic base prices and career statistics.

- **Host Auctioneer Command Center**:
  - Start Auction, Pause, Resume, Sell Now (Hammer Down), Mark Unsold, Skip Player, and **Undo Last Action** (complete state rollback: refunds winning team's purse, removes player from squad, and returns player to the podium).
- **Squad Inspection Drawer**:
  - Live inspection of all 10 franchise rosters categorized by Batsmen, Bowlers, All-rounders, and Wicketkeepers.

---

## 🏗️ Architecture

```
                             ┌──────────────────────────────┐
                             │     Next.js 14 Frontend      │
                             │ React + Tailwind + Zustand   │
                                                          └──────────────┬───────────────┘
                                            │
                              WebSocket (Socket.IO) & HTTP
                                            │
                             ┌──────────────▼───────────────┐
                             │     NestJS Backend Server    │
                             │   - Server State Machine     │
                             │   - Atomic Bid Validator     │
                             │   - Anti-Sniping Clock       │
                             │   - Host Orchestration       │
                             └──────────────┬───────────────┘
                                            │
                   ┌────────────────────────┴────────────────────────┐
                   │                                                 │
          ┌────────▼────────┐                               ┌────────▼────────┐
          │   Prisma ORM    │                               │ In-Memory/Redis │
          │ SQLite / Postgre│                               │  Realtime State │
          │ Users, Rooms,   │                               │ Live Bids, Delta│
          │ Teams, Squads   │                               │ Timers, Mutexes │
          └─────────────────┘                               └─────────────────┘
```

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- Node.js 18+ (tested on Node.js v22)
- npm 10+

### 2. Start the Backend Server
```powershell
# Open terminal 1
cd backend
npm run start:dev
```
*Backend runs on `http://localhost:4000` with WebSocket gateway on port `4000`.*

### 3. Start the Next.js Frontend
```powershell
# Open terminal 2
cd frontend
npm run dev
```
*Frontend runs on `http://localhost:3000`.*

---

## 🎮 How to Play with Friends

1. **Visit `http://localhost:3000`** in your browser.
2. Enter your manager nickname, set a room password, and click **Create Room**.
3. Copy your unique 6-character room code (e.g. `IPL-LFHB`) and share it with your friends.
4. Friends visit `http://localhost:3000`, select **Join Room**, enter their name and the room code.
5. In the **Lobby**:
   - Each player selects an available franchise (CSK, MI, RCB, KKR, etc.).
   - The host configures rules (Purse: ₹100 Cr – ₹150 Cr, Timer: 15s – 35s, Overseas: 8).
6. The host clicks **Start Auction**!
7. The server automatically nominates the first player lot.
8. Connected managers click bid buttons to raise in real-time.
9. When the countdown reaches 0 without higher bids, the hammer drops (**SOLD!**), the player is added to the squad, purse is deducted, and the next star is nominated!

---

## 🧪 Automated End-to-End Simulation Test

To run a multi-client automated test simulating 3 managers bidding, testing race conditions, self-bidding rejection, and timer completion:

```powershell
cd backend
npx tsx test-auction-simulation.ts
```

---

## 🐳 Docker Deployment

To launch the full production environment (PostgreSQL, Redis, NestJS Backend, and Next.js Frontend):

```bash
docker compose up --build -d
```
