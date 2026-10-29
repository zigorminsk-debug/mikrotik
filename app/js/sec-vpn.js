/* Раздел: VPN — все поддерживаемые MikroTik */
section({
  id: 'vpn',
  icon: '🔐',
  title: 'VPN в MikroTik',
  badge: 'обзор и ограничения',
  lead: 'WireGuard, IPsec (IKEv2, site-to-site), L2TP/IPsec, PPTP, L2TP, SSTP, OVPN — все VPN RouterOS: ' +
        'выбор технологии и примеры; отдельные сценарии требуют самостоятельного проектирования.',
  steps: [
    { t: 'Выбор VPN: сравнительная таблица', b: [
      TBL(['VPN', 'Порт', 'Безопасность', 'Скорость', 'Клиенты', 'Когда брать'], [
        ['**WireGuard**', 'UDP 51820+', 'Отличная (Noise)', 'Очень высокая', 'Win/iOS/Android/Linux (нативно)', 'Удалённый доступ — **по умолчанию**'],
        ['**IPsec IKEv2**', 'UDP 500/4500', 'Отличная (IPsec)', 'Высокая', 'Встроенные Win/iOS/Android', 'Мобильные клиенты, корпоративные ВПН'],
        ['**L2TP/IPsec**', 'UDP 500/4500/1701', 'Хорошая', 'Средняя', 'Зависит от ОС и версии', 'Когда IKEv2 недоступен'],
        ['**IPsec site-to-site**', 'UDP 500/4500', 'Отличная', 'Высокая', 'Роутер↔роутер', 'Связка двух офисов'],
        ['**SSTP**', 'TCP 443', 'Хорошая (TLS)', 'Средняя', 'Windows (нативно)', 'Обход блокировок через HTTPS'],
        ['**OVPN**', 'TCP/UDP 1194', 'Хорошая', 'Средняя', 'OpenVPN GUI/Tunnelblick', 'Нужен .ovpn-конфиг'],
        ['**PPTP**', 'TCP 1723 + GRE', '**Слабая**', 'Высокая', 'Встроенные', 'Только legacy-оборудование'],
        ['**L2TP без IPsec**', 'UDP 1701', '**Слабая**', 'Средняя', 'Встроенные', 'Не рекомендуется']
      ]),
      WARN('PPTP криптографически слаб, а L2TP без IPsec не шифрует трафик; не используйте их для защищённого доступа. Для всего нового — **WireGuard** или **IKEv2**.'),
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
#   public-key="AbCd..." (приватный ключ никому не передавайте)

# 4) Добавить клиента (его публичный ключ — из приложения WireGuard):
/interface wireguard peers add \\
    public-key="КЛИЕНТСКИЙ_ПУБЛИЧНЫЙ_КЛЮЧ" \\
    allowed-address=10.10.10.2/32 \\
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
      WARN('Проверьте порядок правил: добавленные в конец accept могут не сработать после существующего drop. Разрешите только необходимый доступ, проверьте обратный маршрут и не публикуйте приватные ключи.'),
      NOTE('Уникальность адреса клиента: `allowed-address=10.10.10.2/32` и `Address = 10.10.10.2/32` — каждый клиент со своим .3, .4… Для разделения доступа задавайте разные allowed-address.')
    ]},

    { t: 'IPsec IKEv2 (road warrior) — для мобильных', b: [
      P('IKEv2 применяют для удалённого доступа, но выбор аутентификации и поддержка клиентов зависят от ОС. Для совместимости со встроенным клиентом Windows используйте проверенную схему с сертификатами или EAP/RADIUS.'),
      OL(['Подготовьте и проверьте удостоверяющий центр, серверный сертификат с корректным именем, клиентские учётные данные и доверие клиента.', 'Настройте peer, identity, mode-config и динамические политики согласно выбранной схеме аутентификации.', 'Разрешите необходимые IPsec-пакеты в firewall, настройте доступ к LAN и проверьте реальное подключение клиента.']),
      WARN('Предыдущий пример PSK с /ppp secret не являлся готовой настройкой EAP и удалён. Графическая лаборатория предлагает отдельный проект с сертификатами, который также требуется проверить на конкретной версии и клиенте; скриншота этого пункта пока нет.'),
      TIP('Документация MikroTik: https://help.mikrotik.com/docs/spaces/ROS/pages/11993097/IPsec')
    ]},

    { t: 'L2TP/IPsec — универсальный вариант', b: [
      P('Классика для встроенных клиентов Windows/Android/iOS, когда IKEv2 по какой-то причине не работает.'),
      CMD(
`/ip pool add name=vpn-pool ranges=10.10.30.10-10.10.30.100
/ppp profile add name=vpn-profile local-address=10.10.30.1 remote-address=vpn-pool dns-server=77.88.8.8
/ppp secret add name=employee password="ЗАДАЙТЕ_СИЛЬНЫЙ_ПАРОЛЬ" profile=vpn-profile service=l2tp
/interface l2tp-server server set enabled=yes default-profile=vpn-profile \\
    use-ipsec=required ipsec-secret="ЗАДАЙТЕ_СИЛЬНЫЙ_ОБЩИЙ_КЛЮЧ" authentication=mschap2
/ip firewall filter add chain=input protocol=udp dst-port=500,4500 in-interface-list=WAN action=accept comment="IKE"
/ip firewall filter add chain=input protocol=ipsec-esp in-interface-list=WAN action=accept comment="ESP"
/ip firewall filter add chain=input protocol=udp dst-port=1701 ipsec-policy=in,ipsec in-interface-list=WAN action=accept comment="L2TP в IPsec"`,
        'L2TP/IPsec сервер'),
      P('**Клиент**: VPN → Добавить → тип **L2TP/IPsec с общим ключом**, сервер — публичный IP, общий ключ — ваш PSK, логин/пароль из `/ppp secret`.'),
      WARN('Проверьте порядок firewall: разрешающие правила должны стоять до подходящего drop. Разрешение UDP 1701 ограничено `ipsec-policy=in,ipsec`; отдельно настройте доступ к LAN и обратные маршруты. Без IPsec L2TP не шифрует данные. Снимка именно этой конфигурации пока нет.')
    ]},

    { t: 'IPsec site-to-site, SSTP и OpenVPN', b: [
      P('Site-to-site IPsec соединяет непересекающиеся подсети; нужны согласованные peer, identity и политики на обеих сторонах, исключение из NAT и правила firewall. Не меняйте общий default proposal без оценки других VPN.'),
      P('Для SSTP и OpenVPN необходима проверенная схема сертификатов, подходящая конкретной версии RouterOS и клиенту. Открывайте только действительно используемые порты.'),
      WARN('Прежние шаблоны этих сценариев не были полноценной проверенной конфигурацией и убраны, чтобы их не применили как готовые. Собственных снимков для этих пунктов пока нет. PPTP небезопасен, L2TP без IPsec не шифрует трафик; не используйте их для защищённого удалённого доступа.'),
      TIP('См. документацию IPsec: https://help.mikrotik.com/docs/spaces/ROS/pages/11993097/IPsec')
    ]},

    { t: 'Проверка и диагностика VPN', b: [
      CMD(
`# WireGuard:
/interface wireguard peers print
/interface wireguard peers print detail   # last-handshake должен обновляться

# IPsec:
/ip ipsec peer print                     # state=established
/ip ipsec active-peers print
/log print where topics~"ipsec"

# PPP-семейство (PPTP/L2TP/SSTP/OVPN):
/ppp active print                         # подключённые сессии
/ppp secret print

# Общее:
ping 10.10.10.2                          # пинг VPN-клиента с роутера
/ip route print where dst-address~"10.10" # маршруты туннелей`,
        'Проверка VPN'),
      TBL(['Проблема', 'Что проверить'], [
        ['Клиент не подключается', 'Открыт ли порт (netwatch/scan), не режет ли input-правило, данные PSK/пароль'],
        ['Подключился, но нет ресурсов', 'Правила forward VPN→LAN, AllowedIPs на клиенте, обратные маршруты'],
        ['WireGuard без handshake', 'Endpoint-адрес/порт, UDP не заблокирован провайдером, allowed-address'],
        ['IPsec не становится established', '`/log print where topics~"ipsec"` — обмен ключами, совпадение PSK, NAT-T (4500/udp)']
      ]),
      TIP('Для устройств за роутером используется цепочка forward, а для WinBox и других служб самого роутера — input; проверьте также IP Services, маршруты и IPv6.')
    ]}
  ]
});
