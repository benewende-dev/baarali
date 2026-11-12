// BAARALI(08/11/2026): Baarali in the browser. The phone draws its icons with
// iPhone symbols (`source="sf:…"`), which a browser does not have: on the web
// they are drawn with the desktop app's icons (Lucide), the rest of expo-image
// unchanged. Only metro.config.js sends `expo-image` here, and on the web only.
import * as React from 'react';
import * as Real from 'expo-image/src/index';
import { icons } from 'lucide-react';

export * from 'expo-image/src/index';

const SF = {
  'xmark': 'X', 'checkmark': 'Check', 'person.2': 'Users', 'magnifyingglass': 'Search', 'folder': 'Folder',
  'chevron.right': 'ChevronRight', 'chevron.left': 'ChevronLeft', 'chevron.down': 'ChevronDown', 'chevron.up.chevron.down': 'ChevronsUpDown',
  'plus': 'Plus', 'doc.text': 'FileText', 'doc': 'File', 'doc.on.doc': 'Copy', 'waveform': 'AudioLines',
  'checkmark.circle.fill': 'CircleCheck', 'checkmark.shield': 'ShieldCheck', 'square.grid.2x2': 'LayoutGrid', 'square.grid.2x2.fill': 'LayoutGrid',
  'mic': 'Mic', 'mic.fill': 'Mic', 'link': 'Link', 'ellipsis': 'Ellipsis', 'ellipsis.circle': 'CircleEllipsis', 'ellipsis.circle.fill': 'CircleEllipsis',
  'stop': 'Square', 'stop.fill': 'Square', 'speaker.wave.2': 'Volume2', 'play.fill': 'Play', 'pause.fill': 'Pause', 'play.rectangle': 'SquarePlay',
  'backward.end.fill': 'SkipBack', 'forward.end.fill': 'SkipForward',
  'number': 'Hash', 'lock': 'Lock', 'lock.fill': 'Lock', 'face.smiling': 'Smile', 'envelope': 'Mail', 'envelope.fill': 'Mail', 'at': 'AtSign',
  'circle': 'Circle', 'xmark.circle.fill': 'CircleX', 'bubble.left': 'MessageSquare', 'bubble.left.and.bubble.right': 'MessagesSquare',
  'bubble.left.and.bubble.right.fill': 'MessagesSquare', 'tray': 'Inbox', 'archivebox': 'Archive', 'sun.horizon': 'Sunrise', 'star.fill': 'Star',
  'square.and.arrow.up': 'Share', 'sparkle': 'SlidersHorizontal', 'sparkles': 'SlidersHorizontal', 'rectangle.portrait.and.arrow.right': 'LogOut', 'qrcode.viewfinder': 'ScanQrCode',
  'photo': 'Image', 'person.crop.square': 'SquareUser', 'person.crop.circle': 'CircleUser', 'laptopcomputer.and.iphone': 'MonitorSmartphone',
  'desktopcomputer': 'Monitor', 'hand.tap': 'Pointer', 'globe': 'Globe', 'chevron.left.forwardslash.chevron.right': 'Code',
  'arrow.up.right': 'ArrowUpRight', 'arrow.up': 'ArrowUp', 'arrow.clockwise': 'RotateCw', 'app': 'Square',
  'sidebar.left': 'PanelLeft', 'gearshape': 'Settings',
  'sun.max': 'Sun', 'calendar.badge.checkmark': 'CalendarCheck', 'receipt': 'Receipt', 'hand.raised': 'Handshake', 'binoculars': 'Telescope',
  'chart.line.uptrend.xyaxis': 'TrendingUp', 'bolt': 'Zap', 'calendar.badge.clock': 'CalendarClock', 'exclamationmark.circle': 'CircleAlert', 'pencil': 'Pencil',
  'person.3': 'UsersRound', 'bell': 'Bell', 'square.and.pencil': 'SquarePen', 'paperclip': 'Paperclip',
  'iphone': 'Smartphone', 'laptopcomputer': 'Laptop',
  'clock': 'Clock', 'checklist': 'ListTodo', 'books.vertical': 'LibraryBig', 'calendar': 'Calendar', 'film': 'Clapperboard',
};

function flat(style) {
  if (!style) return {};
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flat));
  return typeof style === 'object' ? style : {};
}

export const Image = React.forwardRef(function Image(props, ref) {
  const { source } = props;
  const name = typeof source === 'string' && source.startsWith('sf:') ? source.slice(3) : null;
  if (name === null) return React.createElement(Real.Image, { ...props, ref });
  const Icon = icons[SF[name] ?? 'Circle'] ?? icons.Circle;
  const s = flat(props.style);
  const size = s.width ?? s.height ?? 18;
  const filled = name.endsWith('.fill') && /^(play|pause|stop|star|backward|forward)/.test(name);
  return React.createElement('span', {
    role: props.accessibilityLabel ? 'img' : undefined,
    'aria-label': props.accessibilityLabel,
    'aria-hidden': props.accessibilityLabel ? undefined : true,
    style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: s.width ?? size, height: s.height ?? size, flexShrink: 0, color: props.tintColor ?? s.tintColor ?? 'currentColor' },
  }, React.createElement(Icon, { size, strokeWidth: 2, fill: filled ? 'currentColor' : 'none', 'aria-hidden': true }));
});

export default Image;
