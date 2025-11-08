# 自动登录到桌面，并设置桌面背景为纯色

cat >/etc/gdm3/custom.conf << EOF123
[daemon]
AutomaticLoginEnable=true
AutomaticLogin=icpc

[security]

[xdmcp]

[chooser]

[debug]

EOF123

convert -size 1920x1080 xc:white /var/lib/icpc/desktop-background.png
systemctl restart gdm3