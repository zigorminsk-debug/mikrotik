/* Раздел: LAN, VLAN и Wi-Fi. Примеры рассчитаны на RouterOS 7. */
section({
  id: 'networks', icon: '📶', title: 'LAN, VLAN и Wi‑Fi', badge: 'шаг 2',
  lead: 'Основная LAN, отдельный гостевой VLAN и Wi‑Fi для RouterOS 7: планирование, настройка, изоляция и проверка.',
  steps: [
    { t: 'Что означают LAN, мост и VLAN', b: [
      P('**LAN** — локальная сеть устройств. **Bridge** объединяет порты второго уровня, а адрес моста служит шлюзом основной сети. **VLAN** отделяет кадры разных сегментов: access-порт принимает нетегированный трафик и назначает ему PVID; trunk переносит теги нескольких VLAN.'),
      P('Пример: основная LAN `192.168.88.0/24`, шлюз `192.168.88.1`; гостевой VLAN 20 — `192.168.99.0/24`, шлюз `192.168.99.1`. Подсети не должны пересекаться с WAN и VPN.'),
      IMG('assets/img/official/bridge-lan.png', 'Официальный пример WinBox: создание моста. Значения могут отличаться от вашей схемы.'),
      WARN('Перед изменением моста и VLAN сделайте резервную копию, откройте Safe Mode и подготовьте доступ через консоль или отдельный порт. Включение VLAN Filtering может отключить управление.')
    ]},
    { t: 'Основная LAN и DHCP', b: [
      P('Для чистой конфигурации, где `ether1` — WAN, а `ether2`–`ether4` — LAN. Сверьте интерфейсы с устройством; не создавайте второй bridge или DHCP рядом с существующим без анализа.'),
      IMG('assets/img/official/ip-address.png', 'Официальный пример WinBox: назначение адреса интерфейсу.'),
      IMG('assets/img/official/dhcp-server.png', 'Официальный пример WinBox: мастер DHCP Setup.'),
      CMD(`# Основная LAN: bridge VLAN Filtering пока выключен
/interface bridge add name=bridge-lan vlan-filtering=no
/interface bridge port add bridge=bridge-lan interface=ether2
/interface bridge port add bridge=bridge-lan interface=ether3
/interface bridge port add bridge=bridge-lan interface=ether4
/ip address add address=192.168.88.1/24 interface=bridge-lan

# Автоматические адреса; статику назначайте вне .100–.199
/ip pool add name=pool-lan ranges=192.168.88.100-192.168.88.199
/ip dhcp-server add name=dhcp-lan interface=bridge-lan address-pool=pool-lan disabled=no
/ip dhcp-server network add address=192.168.88.0/24 gateway=192.168.88.1 dns-server=192.168.88.1
/ip dns set servers=1.1.1.1,8.8.8.8 allow-remote-requests=yes`, 'Основная сеть'),
      NOTE('Открывайте DNS роутера только нужным внутренним сегментам; не разрешайте произвольные DNS-запросы с WAN. DHCP-адреса в лаборатории — примеры, а реальные аренды проверяются в Leases.')
    ]},
    { t: 'Рабочая точка Wi‑Fi — пакет wifi', b: [
      P('В RouterOS **7.13 и новее** команды ниже относятся к пакету `wifi`. Устройство должно иметь радио и поддерживать режим AP. Имена и доступные пакеты зависят от модели; для старого `wireless` и `wifiwave2` меню отличается.'),
      P('Замените `wifi1`, SSID, пароль и страну на свои. Страну выбирайте из списка RouterOS согласно фактическому месту использования. В примере WPA2-PSK; используйте уникальный сильный пароль.'),
      CMD(`# Сначала выключите радио; предполагается чистая конфигурация без существующего datapath/bridge-порта
/interface wifi set [find name="wifi1"] disabled=yes configuration.mode=ap configuration.country="Belarus" configuration.ssid="Work-Net" security.authentication-types=wpa2-psk security.passphrase="ReplaceWithStrongPassword"
/interface bridge port add bridge=bridge-lan interface=wifi1
# После настройки firewall и проверки порта включите:
/interface wifi set [find name="wifi1"] disabled=no`, 'Рабочий SSID в основной LAN'),
      WARN('Существующий datapath может автоматически добавить Wi‑Fi в мост: проверьте текущие настройки, чтобы не создать повторный порт. Наличие или имена wifi1/wifi2 не гарантированы на каждой модели.')
    ]},
    { t: 'Гостевой VLAN и гостевой SSID', b: [
      P('В примере `ether4` — гостевой **access**-порт, `wifi-guest` — виртуальный гостевой SSID, `bridge-lan` — tagged CPU-порт VLAN 20. Основные `ether2`, `ether3` и `wifi1` остаются в нетегированной основной LAN (PVID 1). Не подключайте основную и гостевую сети к одному неуправляемому коммутатору.'),
      CMD(`# Подготовка при выключенном vlan-filtering; ether4 уже добавлен в bridge-lan
/interface bridge port set [find where bridge=bridge-lan and interface=ether4] pvid=20 frame-types=admit-only-untagged-and-priority-tagged ingress-filtering=yes disabled=yes

# Виртуальный SSID поддерживается не всеми радио/пакетами; пока отключён
/interface wifi add name=wifi-guest master-interface=wifi1 disabled=yes configuration.mode=ap configuration.ssid="Guest-Net" security.authentication-types=wpa2-psk security.passphrase="ReplaceGuestPassword"
/interface bridge port add bridge=bridge-lan interface=wifi-guest pvid=20 frame-types=admit-only-untagged-and-priority-tagged ingress-filtering=yes
/interface bridge vlan add bridge=bridge-lan tagged=bridge-lan untagged=ether4,wifi-guest vlan-ids=20
/interface vlan add name=vlan-guest interface=bridge-lan vlan-id=20
/ip address add address=192.168.99.1/24 interface=vlan-guest
/ip pool add name=pool-guest ranges=192.168.99.100-192.168.99.199
/ip dhcp-server add name=dhcp-guest interface=vlan-guest address-pool=pool-guest disabled=no
/ip dhcp-server network add address=192.168.99.0/24 gateway=192.168.99.1 dns-server=192.168.99.1`, 'Гостевой VLAN и DHCP'),
      P('В WinBox: **Bridge → Ports** — PVID и тип кадров; **Bridge → VLANs** — tagged/untagged; **Interfaces → VLAN** — интерфейс VLAN на мосту; **IP → Addresses / DHCP Server** — адрес и выдача.'),
      WARN('До включения VLAN Filtering гостевой порт ether4 и гостевое радио должны оставаться выключенными, иначе гости могут временно оказаться в основной LAN. Не включайте фильтрацию до проверки таблицы VLAN и правил firewall. Доступ между клиентами одного VLAN на L2 эти правила сами по себе не запрещают.')
    ]},
    { t: 'Firewall: гостям интернет, но не доступ в LAN', b: [
      P('Ниже дополнительные правила к базовому firewall. Они требуют существующего списка интерфейсов `WAN`. Более ранние правила accept могут разрешить дополнительный доступ, например ICMP; проверьте всю цепочку. Размещайте их **до общих разрешений и завершающих drop** соответствующих цепочек; слепое добавление в конец может не сработать. Если нужен доступ к отдельному ресурсу, создайте узкое исключение до запрета.'),
      CMD(`# INPUT: DHCP и DNS роутера для гостей; остальное к самому роутеру запрещаем
/ip firewall filter add chain=input in-interface=vlan-guest protocol=udp dst-port=53,67 action=accept comment="guest DNS DHCP"
/ip firewall filter add chain=input in-interface=vlan-guest protocol=tcp dst-port=53 action=accept comment="guest DNS TCP"
/ip firewall filter add chain=input in-interface=vlan-guest action=drop comment="guest no router management"

# FORWARD: гости — только в WAN; ограничить также новые LAN -> guest
/ip firewall filter add chain=forward in-interface=vlan-guest out-interface-list=WAN action=accept comment="guest internet"
/ip firewall filter add chain=forward in-interface=vlan-guest action=drop comment="guest no internal networks"
/ip firewall filter add chain=forward out-interface=vlan-guest connection-state=new action=drop comment="no new internal to guest"`, 'Правила гостевого сегмента'),
      P('После проверки firewall и таблицы VLAN включайте фильтрацию и радио. При иной схеме firewall скорректируйте порядок: действующие established-соединения, исключения, FastTrack и аппаратное ускорение могут влиять на проверку.'),
      CMD(`# Только после проверки и при наличии консольного доступа
/interface bridge set [find name=bridge-lan] vlan-filtering=yes
/interface bridge port set [find where bridge=bridge-lan and interface=ether4] disabled=no
/interface wifi set [find name="wifi1"] disabled=no
/interface wifi set [find name=wifi-guest] disabled=no`, 'Включение после проверки'),
      WARN('Публикация порта, VPN или отдельные разрешения могут специально открыть путь в гостевую сеть. Для интернета нужен NAT/маршрутизация; они настраиваются отдельно.')
    ]},
    { t: 'Дополнительно: Hotspot и ограничение скорости', b: [
      P('Для каптив-портала используйте в WinBox **IP → Hotspot → Hotspot Setup** и выберите `vlan-guest`, если гостевая сеть создана именно на нём. Мастер запросит адреса, пул, DNS-имя и учётные данные. Проверьте ограничения лицензии, сертификат и доступность портала на своих устройствах.'),
      WARN('Hotspot и скорость в графической лаборатории пока не моделируются и автоматически не настраиваются. Мастер может изменить DNS, DHCP и firewall; перед запуском проверьте существующую конфигурацию и сделайте резервную копию.'),
      CMD(`# Пример общего ограничения для адресов гостей (при необходимости)
/queue simple add name=guest-limit target=192.168.99.0/24 max-limit=20M/20M
/queue simple print stats`, 'Ограничение скорости гостей'),
      NOTE('FastTrack и аппаратное ускорение могут обходить очереди. Протестируйте скорость при реальном трафике; при необходимости скорректируйте правила FastTrack.')
    ]},
    { t: 'Старый пакет Wireless и ограничения', b: [
      IMG('assets/img/official/wireless-legacy.png', 'Официальный снимок старого пакета Wireless, не интерфейс нового wifi.'),
      IMG('assets/img/official/wireless-security-legacy.png', 'Официальный пример старого профиля безопасности Wireless.'),
      P('На устройстве со старым пакетом `wireless` используйте меню **Wireless**, а не приведённые выше команды `/interface wifi`. Для отдельных VLAN и виртуальных точек настройки зависят от модели и драйвера; предварительно сверьте документацию MikroTik.'),
      CMD(`# Пример только для пакета wireless; проверьте имя wlan1 и фактическую страну
/interface wireless security-profiles add name=sec-work mode=dynamic-keys authentication-types=wpa2-psk wpa2-pre-shared-key="ReplaceWithStrongPassword"
/interface wireless set [find default-name=wlan1] mode=ap-bridge ssid="Work-Net" security-profile=sec-work country=belarus frequency-mode=regulatory-domain disabled=no
# При необходимости отдельно добавьте wlan1 в существующий bridge LAN.`, 'Старый Wireless: основной SSID'),
      NOTE('Роутер без беспроводного радио не станет точкой доступа только от команды. В лаборатории генератор пока поддерживает пакет wifi, а не старый Wireless или wifiwave2.')
    ]},
    { t: 'Несколько сетевых карт ПК или сервера в лаборатории', b: [
      P('Один ПК или сервер может иметь до четырёх сетевых карт. Каждая карта имеет собственный кабель, сегмент и IPv4-настройки; устройство не объединяет свои порты в мост. В учебной модели это отдельные конечные подключения.'),
      OL([
        'На карте выберите ПК или сервер → Настроить. В разделе «Дополнительные сетевые карты» выберите их количество от 1 до 4.',
        'Для каждой карты задайте основную LAN или гостевой VLAN и получение адреса: DHCP либо статический IPv4/маска, шлюз и при необходимости DNS. Гостевой VLAN и его DHCP должны быть включены на MikroTik.',
        'Создайте отдельную линию от каждой карты к MikroTik или коммутатору. Линии назначаются свободным картам автоматически. Нажмите на линию, чтобы увидеть или поменять её сетевую карту; занятая карта недоступна.',
        'Запустите проверку: таблица адресов покажет каждую подключённую карту, а неподключённые будут помечены. Настройте соответствующие адаптеры на реальном ПК или сервере самостоятельно.',
        'Чтобы убрать карту, сначала удалите её линию или назначьте линии другую свободную карту. Публикация порта относится к адресу карты 1.'
      ]),
      WARN('В одном неуправляемом коммутаторе нельзя смешивать основную и гостевую сети: им нужны разные access-порты MikroTik и отдельные коммутаторы. Модель не включает мост, bonding или балансировку на ПК и не проверяет реальный трафик.'),
      P('Если обе карты получают шлюзы, операционная система выбирает маршрут по своей таблице и метрикам. Две карты в одной подсети или подключение к изолированному VLAN могут потребовать дополнительной настройки и проверки; учебная анимация показывает пути карт независимо и не моделирует выбор маршрута ОС.')
    ]},
    { t: 'Проверка и поиск ошибок', b: [
      OL([
        'В Bridge → Ports и VLANs проверьте PVID, tagged/untagged и активное состояние VLAN Filtering.',
        'В DHCP Server → Leases проверьте основную и гостевую аренды: адрес, шлюз и DNS должны относиться к своему сегменту.',
        'Проверьте выход гостя в интернет и отсутствие доступа к рабочему серверу и управлению роутером; проверьте отдельно доступ между гостевыми клиентами.',
        'В WiFi проверьте активную конфигурацию, страну и регистрацию клиента; отдельно проверьте реальное покрытие и работу после перезагрузки.'
      ]),
      CMD(`/interface bridge port print detail
/interface bridge vlan print detail
/interface vlan print
/interface wifi print detail
/ip address print
/ip dhcp-server lease print
/ip firewall filter print stats`, 'Диагностика'),
      NOTE('Лаборатория показывает расчётную схему, не отправляет реальный трафик и не проверяет радио. Источники: официальная документация MikroTik — Bridge VLAN Table и WiFi.')
    ]}
  ]
});
