#!/bin/bash
# ================================================================
# SECTOR CLEAR — VPS セットアップ (マルチプレイヤー対応)
# 対象OS: Ubuntu 22.04 / 24.04
# 実行: sudo bash setup.sh
# ================================================================
set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  SECTOR CLEAR — MULTIPLAYER DEPLOY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. システム更新 ──
echo "[1/8] システム更新..."
apt update -y && apt upgrade -y

# ── 2. Node.js 20 ──
echo "[2/8] Node.js 20 インストール..."
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
fi
echo "  Node: $(node -v) / npm: $(npm -v)"

# ── 3. nginx ──
echo "[3/8] nginx インストール..."
apt install -y nginx
systemctl enable nginx

# ── 4. PM2 (プロセス管理) ──
echo "[4/8] PM2 インストール..."
npm install -g pm2

# ── 5. サーバー依存パッケージ ──
echo "[5/8] サーバー依存パッケージ..."
cd /root/sector-clear-mp/server    # ← ZIPを展開した場所に合わせて調整
npm install --omit=dev

# ── 6. クライアントビルド ──
echo "[6/8] クライアントビルド..."
cd /root/sector-clear-mp/client
npm install
npm run build
echo "  ビルド完了 → dist/"

# ── 7. 静的ファイルをデプロイ ──
echo "[7/8] /var/www/sector-clear へデプロイ..."
mkdir -p /var/www/sector-clear
rm -rf /var/www/sector-clear/*
cp -r dist/* /var/www/sector-clear/

# ── 8. nginx 設定 ──
echo "[8/8] nginx + Socket.io プロキシ設定..."
cp /root/sector-clear-mp/nginx.conf /etc/nginx/sites-available/sector-clear
ln -sf /etc/nginx/sites-available/sector-clear /etc/nginx/sites-enabled/sector-clear
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

# ── PM2 でゲームサーバー起動 ──
echo "  PM2 でゲームサーバー起動..."
cd /root/sector-clear-mp
pm2 start ecosystem.config.js
pm2 save
pm2 startup | tail -1 | bash  # OS起動時に自動起動

# ── 完了 ──
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "YOUR_VPS_IP")
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ デプロイ完了！"
echo ""
echo "  ブラウザでアクセス:"
echo "  → http://${SERVER_IP}"
echo ""
echo "  ゲームサーバー状態確認:"
echo "  → pm2 status"
echo "  → pm2 logs sector-clear"
echo ""
echo "  ヘルスチェック:"
echo "  → curl http://${SERVER_IP}/health"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
