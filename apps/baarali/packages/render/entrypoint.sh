#!/bin/sh
# Chrome renders pages an agent wrote: they reach the public web (fonts,
# images) but never Fly's private network, where the instances live.
# Fails closed: without these rules the service does not start.
set -eu
ip6tables -A OUTPUT -o lo -j ACCEPT
ip6tables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
# Fly's resolver answers DNS on fdaa::3; nothing else of it is reachable.
ip6tables -A OUTPUT -d fdaa::3 -p udp --dport 53 -j ACCEPT
ip6tables -A OUTPUT -d fdaa::3 -p tcp --dport 53 -j ACCEPT
ip6tables -A OUTPUT -d fc00::/7 -j REJECT
ip6tables -A OUTPUT -d fe80::/10 -j REJECT
iptables -A OUTPUT -o lo -j ACCEPT
iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
for net in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 169.254.0.0/16 100.64.0.0/10; do
  iptables -A OUTPUT -d "$net" -j REJECT
done
mkdir -p /tmp/renders && chown node:node /tmp/renders
exec setpriv --reuid=node --regid=node --init-groups node /app/dist/main.js
