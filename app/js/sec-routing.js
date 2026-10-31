/* Раздел: Маршрутизация */
section({
  id: 'routing',
  icon: '🧭',
  title: 'Маршрутизация',
  badge: 'шаг 4',
  lead: 'Статические маршруты, маршрутизация между сегментами (VLAN), таблицы RouterOS v7 и политическая ' +
        'маршрутизация — когда трафик разных подсетей должен уходить через разные провайдеры.',
  steps: [
    { t: 'Основы: таблица маршрутизации', b: [
      P('Роутер выбирает маршрут по **наибольшему совпадению префикса** (longest match), при равенстве — по меньшему `distance`.'),
      IMG('assets/img/routes-failover.svg', 'WinBox: IP → Routes — таблица с основным и резервным каналом (distance 1 и 2)'),
      CMD(
`/ip route print
#    D A S DstAddress        Gateway        Distance
#    D A   0.0.0.0/0         pppoe-out1     1        <- маршрут по умолчанию
#    D A   192.168.88.0/24   bridge-lan     0        <- directly connected
#        10.20.0.0/24        192.168.1.1    1        <- добавленный вручную`,
        'Пример /ip route print'),
      TBL(['Флаг', 'Значение'], [
        ['**D**', 'dynamic (создан системой, например подсеть интерфейса)'],
        ['**A**', 'active — используется прямо сейчас'],
        ['**S**', 'static — задан администратором'],
        ['Distance', 'Чем меньше, тем приоритетнее при прочих равных (0–255)']
      ]),
      P('Команда добавления: `/ip route add dst-address=<куда> gateway=<через кого> distance=<приоритет>`.')
    ]},

    { t: 'Статические маршруты: типовые примеры', b: [
      H('1. Доступ к второму офису через VPN/канал'),
      CMD('/ip route add dst-address=10.20.0.0/24 gateway=10.10.10.1 distance=1 comment="Офис 2 через VPN"'),
      H('2. Отдельный сегмент (например, IP-камеры на другом роутере)'),
      CMD('/ip route add dst-address=192.168.50.0/24 gateway=192.168.88.254 distance=1 comment="Сегмент камер"'),
      H('3. Возвратный маршрут для корректной работы подсети за NAT'),
      P('Если клиенты из LAN идут на 192.168.50.0/24, а ответ идёт через шлюз `192.168.88.254` — вернуть трафик нужно **тем же путём** (обычно решается маскарадом на втором роутере либо этим маршрутом):'),
      CMD('# На ВТОРОМ роутере (камеры):\n/ip route add dst-address=192.168.88.0/24 gateway=192.168.88.253 distance=1'),
      H('4. Чёрная дыра / блокировка маршрута'),
      CMD('/ip route add dst-address=203.0.113.0/24 type=blackhole distance=10 comment="Заблокированная сеть"'),
      NOTE('Маршрут добавляется в таблицу `main`. Для отдельных столов — таблицы v7 (следующий шаг).')
    ]},

    { t: 'Маршрутизация между сегментами и VLAN', b: [
      P('Каждый VLAN/мост — свой интерфейс со своим IP: роутер естественно маршрутизирует между ними.'),
      CMD(
`# Пример: VLAN 10 (офис) и VLAN 20 (камеры) поверх bridge-lan:
/interface bridge add name=bridge-lan vlan-filtering=yes
/interface vlan add name=vlan10 interface=bridge-lan vlan-id=10
/interface vlan add name=vlan20 interface=bridge-lan vlan-id=20

/ip address add address=192.168.10.1/24 interface=vlan10
/ip address add address=192.168.20.1/24 interface=vlan20

# Маршруты создадутся автоматически (directly connected).
# Доступ между сегментами разрешаем правилом forward (раздел Firewall).`,
        'VLAN-сегменты'),
      P('Интер-ВLAN-доступ — обычная политика `forward`: разрешить конкретные хосты/порты или всё. Гостевой сегмент держим закрытым от LAN (см. «LAN и Wi-Fi»).')
    ]},

    { t: 'Таблицы маршрутизации RouterOS v7 и политическая маршрутизация', b: [
      P('**Policy routing** — отправлять трафик разных источников через разные шлюзы. В v7 для этого созданы **routing tables**.'),
      CMD(
`# Создаём стол (v7):
/routing table add name=to-isp2 fib

# Помечаем трафик подсети 192.168.88.0/24 на выход в ISP2:
/ip firewall mangle add chain=prerouting in-interface-list=LAN \\
    src-address=192.168.88.0/24 connection-state=new \\
    new-routing-mark=to-isp2 passthrough=yes comment="LAN → ISP2"

# Маршрут для этого стола:
/ip route add dst-address=0.0.0.0/0 gateway=pppoe-out2 \\
    distance=1 routing-mark=to-isp2 check-gateway=ping

# Остальные (без метки) продолжают идти через основной стол main.`,
        'Policy routing в RouterOS v7'),
      P('Типовые задачи на политику:'),
      UL([
        'Сеть гостей/камер — через отдельный (дешёвый) канал;',
        'VPN-трафик — только через резервный провайдер;',
        'Один сервер — вход и выход через конкретного провайдера (важно для публикации).'
      ]),
      NOTE('В RouterOS v6 аналог: `/routing mark` не нужен, используется `routing-mark` прямо в mangle и маршрутах; в v7 обязательны `/routing table add ... fib` — стенд генерирует синтаксис v7.')
    ]},

    { t: 'Диагностика маршрутизации', b: [
      CMD(
`/ip route print                       # таблица маршрутов
/ip route print detail                # причины активности/неактивности
/routing rule print                   # v7: правила выбора стола
/tool traceroute 8.8.8.8              # путь пакетов
/tool traceroute 8.8.8.8 src-address=192.168.88.1
/ip firewall mangle print stats       # счётчики меток`,
        'Инструменты'),
      TBL(['Симптом', 'Что проверить'], [
        ['Нет интернета вообще', 'Активен ли 0.0.0.0/0 (`A`), статус шлюза, masquerade-правило'],
        ['Ходит только часть сайтов', 'DNS (/ip dns), MTU PPPoE (max-mtu=1480)'],
        ['Не виден второй офис/VPN', 'Обратный маршрут на той стороне, dst-address, состояние туннеля'],
        ['Трафик «прыгает» между провайдерами', 'Два маршрута с одинаковым distance и нет check-gateway'],
        ['Гости видят LAN', 'Правила изоляции forward (раздел Firewall)']
      ]),
      TIP('Комбинация `ping <шлюз>` + `ping 8.8.8.8` + `ping example.com` быстро локализует проблему: первый — L2/шлюз, второй — маршрут/провайдер, третий — DNS.')
    ]}
  ]
});
