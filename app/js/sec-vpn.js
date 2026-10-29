/* Раздел: VPN — все поддерживаемые MikroTik */
section({
  id: 'vpn',
  icon: '🔐',
  title: 'VPN в MikroTik',
  badge: 'полный обзор',
  lead: 'WireGuard, IPsec (IKEv2, site-to-site), L2TP/IPsec, PPTP, L2TP, SSTP, OVPN — все VPN RouterOS: ' +
        'когда какой использовать, готовые конфиги сервера и клиента.',
  steps: [
    { t: 'Выбор VPN: сравнительная таблица', b: [
      TBL(['VPN', 'Порт', 'Безопасность', 'Скорость', 'Клиенты', 'Когда брать'], [
        ['**WireGuard**', 'UDP 51820+', 'Отличная (Noise)', 'Очень высокая', 'Win/iOS/Android/Linux (нативно)', 'Удалённый доступ — **по умолчанию**'],
        ['**IPsec IKEv2**', 'UDP 500/4500', 'Отличная (IPsec)', 'Высокая', 'Встроенные Win/iOS/Android', 'Мобильные клиенты, корпоративные ВПН'],
        ['**L2TP/IPsec**', 'UDP 500/4500/1701', 'Хорошая', 'Средняя', 'Встроенные все ОС', 'Когда IKEv2 недоступен'],
        ['**IPsec site-to-site**', 'UDP 500/4500', 'Отличная', 'Высокая', 'Роутер↔роутер', 'Связка двух офисов'],
        ['**SSTP**', 'TCP 443', 'Хорошая (TLS)', 'Средняя', 'Windows (нативно)', 'Обход блокировок через HTTPS'],
        ['**OVPN**', 'TCP/UDP 1194', 'Хорошая', 'Средняя', 'OpenVPN GUI/Tunnelblick', 'Нужен .ovpn-конфиг'],
        ['**PPTP**', 'TCP 1723 + GRE', '**Слабая**', 'Высокая', 'Встроенные', 'Только legacy-оборудование'],
        ['**L2TP без IPsec**', 'UDP 1701', '**Слабая**', 'Средняя', 'Встроенные', 'Не рекомендуется']
      ]),
      WARN('PPTP и L2TP без IPsec взламываются за минуты — используйте их только для устройств, которые ничего не умеют больше. Для всего нового — **WireGuard** или **IKEv2**.'),
      TIP('Правило выбора: роутер↔роутер → IPsec site-to-site; человек↔роутер → WireGuard (или IKEv2); корпоративный клиент без WireGuard → IKEv2.')
    ]},

    { t: 'WireGuard: сервер на роутере', b: [
      P('Самый простой и быстрый VPN в RouterOS v7. Интерфейс создаёт пару ключей автоматически.'),
      CMD(
`# 1) Интерфейс сервера (порты наружу открыть в firewall — ниже):
/interface wireguard add listen-port=13231 name=wg0 comment="VPN"

# 2) Адрес сервера в туннеле:
/ip address add address=10.10.10.1/24 interface=wg0

# 3) Узнать ПУБЛИЧНЫЙ ключ сервера (для клиентов):
/interface wireguard print detail
#   private-key="..." public-key="AbCd..."

# 4) Добавить клиента (его публичный ключ — из приложения WireGuard):
/interface wireguard peers add \\
    public-key="КЛИЕНТСКИЙ_ПУБЛИЧНЫЙ_КЛЮЧ" \\
    allowed-address=10.10.10.2/32 \\
    endpoint-address=ВАШ_ПУБЛИЧНЫЙ_IP endpoint-port=13231 \\
    interface=wg0 comment="Ноутбук Ивана"

# 5) Firewall: открыть UDP-порт (в input, выше правила "Интернет → роутер"):
/ip firewall filter add chain=input protocol=udp dst-port=13231 \\
    in-interface-list=WAN action=accept comment="WireGuard"

# 6) Чтобы VPN-клиенты ходили в LAN — доп. правило forward при необходимости:
/ip firewall filter add chain=forward in-interface=wg0 \\
    out-interface-list=LAN action=accept comment="WG → LAN"`,
        'Сервер WireGuard'),
      P('**Конфиг клиента** (приложение WireGuard → Generate → Edit as text):'),
      CMD(
`[Interface]
PrivateKey = <приватный ключ клиента>
Address = 10.10.10.2/32
DNS = 77.88.8.8

[Peer]
PublicKey = <публичный ключ роутера из /interface wireguard print>
Endpoint = ВАШ_ПУБЛИЧНЫЙ_IP:13231
AllowedIPs = 192.168.88.0/24, 10.10.10.0/24
# AllowedIPs = 0.0.0.0/0 — если нужен весь трафик через роутер`,
        'client.conf'),
      NOTE('Уникальность адреса клиента: `allowed-address=10.10.10.2/32` и `Address = 10.10.10.2/32` — каждый клиент со своим .3, .4… Для разделения доступа задавайте разные allowed-address.')
    ]},

    { t: 'IPsec IKEv2 (road warrior) — для мобильных', b: [
      P('Нативный VPN Windows 10/11, iOS, macOS и Android. Аутентификация — общий ключ (PSK) или сертификат.'),
      CMD(
`# Пул адресов клиентов:
/ip pool add name=vpn-pool ranges=10.10.20.10-10.10.20.100

# Профиль и предложение:
/ip ipsec profile set [ find default ] \\
    hash-algorithm=sha256 lifetime=8h dpd-interval=120s
/ip ipsec proposal set [ find default ] \\
    auth-algorithms=sha256 enc-algorithms=aes-256-gcm,aes-128-gcm

# Выдача адресов клиентам (mode-config):
/ip ipsec mode-config add name=mode-cfg \\
    address-pool=vpn-pool address-prefix-length=32 \\
    system-dns=yes static-dns=77.88.8.8

# Политики и peer:
/ip ipsec policy group add name=ike2-group
/ip ipsec policy add group=ike2-group template=yes \\
    src-address=0.0.0.0/0 dst-address=0.0.0.0/0 proposal=default
/ip ipsec peer add exchange-mode=ike2 name=ike2-peer \\
    profile=default send-initial-contact=yes
/ip ipsec identity add peer=ike2-peer auth-method=pre-shared-key \\
    secret="ОбщийКлючIKEv2!" generate-policy=port-strict \\
    policy-template-group=ike2-group

# Firewall (500/4500 + ESP):
/ip firewall filter add chain=input protocol=udp dst-port=500,4500 \\
    in-interface-list=WAN action=accept comment="IKEv2"
/ip firewall filter add chain=input protocol=ipsec-esp \\
    in-interface-list=WAN action=accept comment="ESP"

# Опционально: логин/пароль вместо/вместе с PSK (EAP):
/ppp profile add name=vpn-ike2 address-pool=vpn-pool use-encryption=required
/ppp secret add name=employee password="ПарольЛогина1!" profile=vpn-ike2`,
        'IKEv2 сервер'),
      P('**Клиент Windows**: Настройки → Сеть → VPN → Добавить: тип **IKEv2**, сервер — публичный IP, тип входа «Использовать общие ключи», пароль — ваш PSK.'),
      P('**Клиент iOS/Android**: VPN → Добавить VPN → IPsec (IKEv2) → сервер, общий ключ, логин/пароль (если EAP).'),

    ]},

    { t: 'L2TP/IPsec — универсальный вариант', b: [
      P('Классика для встроенных клиентов Windows/Android/iOS, когда IKEv2 по какой-то причине не работает.'),
      CMD(
`/ip pool add name=vpn-pool ranges=10.10.30.10-10.10.30.100

# Сервер с обязательным IPsec:
/interface l2tp-server server set enabled=yes default-profile=default \\
    use-ipsec-required=yes ipsec-secrets=l2tp-secret

# Общий ключ IPsec (L2TP-туннель):
/ip ipsec peer add exchange-mode=main name=l2tp-remote profile=default
/ip ipsec identity add peer=l2tp-remote auth-method=pre-shared-key \\
    secret="ОбщийКлючL2TP!"

# Профиль и пользователь:
/ppp profile add name=vpn-profile address-pool=vpn-pool \\
    use-encryption=required dns-server=77.88.8.8 local-address=192.168.88.1
/ppp secret add name=employee password="ПарольЛогина1!" \\
    profile=vpn-profile service=l2tp

# Firewall:
/ip firewall filter add chain=input protocol=udp dst-port=500,4500 \\
    in-interface-list=WAN action=accept comment="IKE"
/ip firewall filter add chain=input protocol=ipsec-esp \\
    in-interface-list=WAN action=accept comment="ESP"
/ip firewall filter add chain=input protocol=udp dst-port=1701 \\
    in-interface-list=WAN action=accept comment="L2TP (только внутри IPsec!)"`,
        'L2TP/IPsec сервер'),
      P('**Клиент**: VPN → Добавить → тип **L2TP/IPsec с общим ключом**, сервер — публичный IP, общий ключ — ваш PSK, логин/пароль из `/ppp secret`.'),
      WARN('Правило на 1701 открывайте **только** с `use-ipsec-required=yes`: без IPsec L2TP не шифрует данные.')
    ]},

    { t: 'IPsec site-to-site: связка двух офисов', b: [
      P('Постоянный туннель «роутер ↔ роутер» между подсетями. Задача: `192.168.88.0/24` ↔ `10.20.0.0/24`, шлюз второго офиса `203.0.113.5`.'),
      CMD(
`# ---- Сторона А (ваш офис) ----
/ip ipsec profile set [ find default ] lifetime=1d
/ip ipsec peer add name=office2 address=203.0.113.5 \\
    exchange-mode=ike2 profile=default
/ip ipsec identity add peer=office2 auth-method=pre-shared-key \\
    secret="ОдинаковыйКлючОбеСтороны!"
/ip ipsec policy group add name=office2
/ip ipsec proposal set [ find default ] enc-algorithms=aes-256-gcm
/ip ipsec policy add group=office2 peer=office2 \\
    src-address=192.168.88.0/24 dst-address=10.20.0.0/24 \\
    proposal=default tunnel=yes

# Firewall:
/ip firewall filter add chain=input protocol=udp dst-port=500,4500 \\
    in-interface-list=WAN action=accept
/ip firewall filter add chain=input protocol=ipsec-esp \\
    in-interface-list=WAN action=accept
/ip firewall filter add chain=forward src-address=192.168.88.0/24 \\
    dst-address=10.20.0.0/24 action=accept comment="Офис2: LAN→LAN"
/ip firewall filter add chain=forward src-address=10.20.0.0/24 \\
    dst-address=192.168.88.0/24 action=accept comment="Офис2: LAN→LAN"

# ---- Сторона Б (зеркально!) ----
# src-address=10.20.0.0/24, dst-address=192.168.88.0/24,
# address=ВАШ_ПУБЛИЧНЫЙ_IP, тот же secret`,
        'Site-to-site'),
      P('Проверка: `/ip ipsec peer print` → состояние `established`, затем `ping 10.20.0.1` из вашего офиса. Если не поднимается — смотрите `/ip ipsec log print` (частые причины: разный PSK, порт 500 закрыт, пересечение подсетей).'),
      TIP('Подсети офисов **не должны** пересекаться (192.168.88 vs 10.20 — ок; два одинаковых /24 — конфликт, перенумеруйте одну сторону).')
    ]},

    { t: 'SSTP — VPN через HTTPS (порт 443)', b: [
      CMD(
`/interface sstp-server server set enabled=yes default-profile=default \\
    certificate=none auth-mschapv2=yes

/ip pool add name=vpn-pool ranges=10.10.40.10-10.10.40.100
/ppp profile add name=vpn-profile address-pool=vpn-pool \\
    use-encryption=required dns-server=77.88.8.8
/ppp secret add name=employee password="ПарольЛогина1!" \\
    profile=vpn-profile service=sstp

/ip firewall filter add chain=input protocol=tcp dst-port=443 \\
    in-interface-list=WAN action=accept comment="SSTP"`,
        'SSTP сервер'),
      P('**Клиент**: Windows «VPN → Добавить» → тип **SSTP**, сервер — публичный IP, логин/пароль. Для шифрования сертификатом создайте сертификат (`/certificate`) и укажите `certificate=<имя>` в сервере.'),
      NOTE('SSTP хорошо проходит там, где открыт только 443/tcp; минус — экосистема в основном Windows.')
    ]},

    { t: 'OVPN', b: [
      CMD(
`/interface ovpn-server server set enabled=yes default-profile=default \\
    auth=sha1,sha256 cipher=aes256,aes128

/ip pool add name=vpn-pool ranges=10.10.50.10-10.10.50.100
/ppp profile add name=vpn-profile address-pool=vpn-pool use-encryption=required
/ppp secret add name=employee password="ПарольЛогина1!" \\
    profile=vpn-profile service=ovpn

/ip firewall filter add chain=input protocol=tcp dst-port=1194 \\
    in-interface-list=WAN action=accept
/ip firewall filter add chain=input protocol=udp dst-port=1194 \\
    in-interface-list=WAN action=accept`,
        'OVPN сервер'),
      P('**Клиент**: OpenVPN GUI / Tunnelblick / Viscosity. Файл конфигурации `.ovpn`:'),
      CMD(
`client
dev tun
proto tcp
remote ВАШ_ПУБЛИЧНЫЙ_IP 1194
resolv-retry infinite
nobind
persist-key
persist-tun
auth-user-pass
cipher AES-256-CBC
remote-cert-tls server`,
        'client.ovpn')
    ]},

    { t: 'PPTP / L2TP без IPsec (legacy)', b: [
      CMD(
`# PPTP:
/interface pptp-server server set enabled=yes default-profile=default
/ip pool add name=vpn-pool ranges=10.10.60.10-10.10.60.100
/ppp profile add name=vpn-profile address-pool=vpn-pool use-encryption=required
/ppp secret add name=old-device password="Пароль!" profile=vpn-profile service=pptp
/ip firewall filter add chain=input protocol=tcp dst-port=1723 \\
    in-interface-list=WAN action=accept
/ip firewall filter add chain=input protocol=gre in-interface-list=WAN action=accept

# L2TP БЕЗ IPsec (не делайте так на публичных адресах!):
/interface l2tp-server server set enabled=yes use-ipsec-required=no`,
        'PPTP / L2TP'),
      WARN('Эти протоколы использовать **только** на закрытых каналах/для legacy-устройств. В интернете по публичному IP — исключительно WireGuard/IKEv2/L2TP-IPsec.')
    ]},

    { t: 'Проверка и диагностика VPN', b: [
      CMD(
`# WireGuard:
/interface wireguard peers print
/interface wireguard peers print detail   # last-handshake должен обновляться

# IPsec:
/ip ipsec peer print                     # state=established
/ip ipsec active-peers print
/ip ipsec log print

# PPP-семейство (PPTP/L2TP/SSTP/OVPN):
/ppp active-print                         # подключённые сессии
/ppp secret print

# Общее:
ping 10.10.10.2                          # пинг VPN-клиента с роутера
/ip route print where dst-address~"10.10" # маршруты туннелей`,
        'Проверка VPN'),
      TBL(['Проблема', 'Что проверить'], [
        ['Клиент не подключается', 'Открыт ли порт (netwatch/scan), не режет ли input-правило, данные PSK/пароль'],
        ['Подключился, но нет ресурсов', 'Правила forward VPN→LAN, AllowedIPs на клиенте, обратные маршруты'],
        ['WireGuard без handshake', 'Endpoint-адрес/порт, UDP не заблокирован провайдером, allowed-address'],
        ['IPsec не становится established', '`/ip ipsec log print` — обмен ключами, совпадение PSK, NAT-T (4500/udp)']
      ]),
      TIP('Для доступа к WinBox/сервисам LAN из VPN достаточно разрешить forward `in-interface=wg0/L2TP-out out-interface-list=LAN` — отдельные input-правила не нужны, трафик идёт через forward.')
    ]}
  ]
});
