/* Раздел: Интерактивный стенд (описание) + Шпаргалка CLI */
section({
  id: 'stand',
  icon: '🛠️',
  type: 'stand',
  title: 'Интерактивный стенд',
  badge: 'новое',
  lead: 'Моделирование конфигурации под вашу задачу.',
  steps: [
    { t: 'Как работает стенд', b: [
      P('Интерактивный стенд помогает спроектировать конфигурацию MikroTik без ошибочных команд на реальном железе. Алгоритм:'),
      OL([
        'Задайте подсети LAN и гостевой сети, пулы адресов;',
        'Укажите тип и количество провайдеров (PPPoE/DHCP/статика/LTE);',
        'Выберите основной и резервный канал;',
        'Укажите тип VPN и внутренние IP/порты для публикации наружу;',
        'Нажмите «Смоделировать настройки» — приложение проверит корректность (пересечения подсетей, конфликты портов, failover);',
        'Получите план адресации, полную конфигурацию RouterOS v7 и чек-лист приёмки.'
      ]),
      IMG('assets/img/stand-modeling.svg', 'Интерактивный стенд — ввод задачи, проверка и сгенерированная конфигурация RouterOS')
    ]},

    { t: 'Что проверяет стенд', b: [
      UL([
        'Пересечение подсетей LAN/гостевой/VPN — ошибка, если есть наложение;',
        'Конфликты портов при публикации (dstnat) — одинаковый порт на разные внутренние IP через одного провайдера;',
        'Corректность failover — два маршрута 0.0.0.0/0 с разным distance и check-gateway;',
        'Наличие masquerade для исходящего трафика;',
        'DNS-серверы указаны для доступа к именам.'
      ]),
      NOTE('Если проверка не проходит — стенд покажет конкретное сообщение об ошибке и подскажет, что исправить.')
    ]},

    { t: 'Что выдаёт на выходе', b: [
      UL([
        'План адресации — таблица со всеми интерфейсами, IP, шлюзами, VLAN;',
        'Полная конфигурация RouterOS v7 — готовые команды для терминала или скрипта;',
        'Инструкция реализации — пошаговая проверочная последовательность на реальном роутере;'
      ]),
      P('Сгенерированную конфигурацию можно сразу применить: через виртуальный роутер (симулятор) для отладки, или на реальный MikroTik по API.')
    ]}
  ]
});

section({
  id: 'cheat',
  icon: '⌨️',
  title: 'Шпаргалка CLI',
  lead: 'Команды RouterOS под рукой: самые частые операции в терминале и WinBox.',
  steps: [
    { t: 'Навигация и системные команды', b: [
      CMD(
`# --- Система ---
/system identity set name=Office-Router
/system clock print ; /system clock set time-zone-name=Europe/Minsk
/system resource print            # CPU, RAM, версия RouterOS
/system package update check-for-updates
/system package update install
/system reboot
/system reset-configuration no-defaults=yes   # заводской сброс!

# --- Пользователи и безопасность ---
/user print
/user set [find name=admin] password="НовыйПароль!"
/user add name=backup-group group=full password="..."
/user ssh-keys import public-key-file=mykey
/ip service disable [ find name=api ]         # лишние сервисы — выкл

# --- Файлы и бэкапы ---
/file print
/system backup save name=b1 password="x"
/export file=config                          # текстовый экспорт
/import file=config.rsc                      # накат на другой роутер`,
        'Система')
    ]},

    { t: 'Сеть, интерфейсы, адреса', b: [
      CMD(
`# --- Интерфейсы ---
/interface print
/interface ethernet set [ find default-name=ether1 ] name=ether1
/interface bridge add name=bridge-lan
/interface bridge port add bridge=bridge-lan interface=ether2
/interface list add name=WAN ; /interface list member add list=WAN interface=ether1

# --- Адреса и пулы ---
/ip address print
/ip address add address=192.168.88.1/24 interface=bridge-lan
/ip pool add name=pool-lan ranges=192.168.88.10-192.168.88.250

# --- DHCP ---
/ip dhcp-server add name=dhcp1 interface=bridge-lan address-pool=pool-lan disabled=no
/ip dhcp-server network add address=192.168.88.0/24 gateway=192.168.88.1 dns-server=77.88.8.8
/ip dhcp-server lease print

# --- DNS ---
/ip dns set servers=77.88.8.8,8.8.8.8 allow-remote-requests=yes`,
        'Сеть')
    ]},

    { t: 'Firewall, NAT, маршруты', b: [
      CMD(
`# --- Filter ---
/ip firewall filter print
/ip firewall filter add chain=input in-interface-list=WAN action=drop
/ip firewall filter remove [ find comment="мой-комментарий" ]

# --- NAT ---
/ip firewall nat add chain=srcnat out-interface-list=WAN action=masquerade
/ip firewall nat add chain=dstnat protocol=tcp dst-port=8080 \\
    action=dst-nat to-addresses=192.168.88.10 to-ports=80

# --- Маршруты ---
/ip route add dst-address=0.0.0.0/0 gateway=pppoe-out1 distance=1 check-gateway=ping
/ip route print where dst-address=0.0.0.0/0

# --- Адрес-листы ---
/ip firewall address-list add list=allowed address=10.0.0.0/8`,
        'Firewall и маршруты')
    ]},

    { t: 'PPPoE, Wi-Fi, VPN, диагностика', b: [
      CMD(
`# --- PPPoE ---
/interface pppoe-client add name=pppoe-out1 interface=ether1 user=u password=p add-default-route=no
/interface pppoe-client monitor pppoe-out1 once

# --- Wi-Fi (v7 / классика) ---
/interface wifi print
/interface wireless print

# --- VPN ---
/interface wireguard add name=wg0 listen-port=13231
/ppp active-print
/ip ipsec peer print

# --- Диагностика ---
ping 8.8.8.8
/tool traceroute 8.8.8.8
/tool netwatch print
/log print where error
/ip firewall filter print stats
/interface monitor-traffic ether1 once`,
        'PPP/WiFi/VPN/диагностика')
    ]},

    { t: 'Горячие клавиши и приёмы WinBox', b: [
      TBL(['Действие', 'Как'], [
        ['Открыть терминал', 'Меню → New Terminal (все команды учебника)'],
        ['Быстрый поиск окна/правила', 'WinBox → поле поиска вверху окна (фильтр любых списков)'],
        ['Переместить правило', 'Drag&drop строк в Filter Rules (порядок = приоритет)'],
        ['Скопировать MAC/IP из Neighbors', 'Клик по строке → поле адреса заполнится'],
        ['Экспорт/импорт', '`/export file=x` → `/import file=x.rsc`'],
        ['Подключение по MAC', 'Даже без IP: Neighbors → MAC → Connect (L2)']
      ]),
      TIP('В терминале работает автодополнение по Tab и история по ↑/↓. Полный справочник: Help → Manual в WinBox или на help.mikrotik.com.')
    ]}
  ]
});
