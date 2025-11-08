# 启动 firefox

cat >/etc/default/domjudge-firefox << EOF123
DISPLAY=:0
EOF123

cat >/usr/lib/systemd/system/domjudge-firefox.service << EOF123
[Unit]
Description=DOMJUDGE FIREFOX

[Service]
Type=simple
EnvironmentFile=-/etc/default/domjudge-firefox
ExecStart=/usr/bin/firefox-esr

EOF123

systemctl daemon-reload
systemctl restart domjudge-firefox
