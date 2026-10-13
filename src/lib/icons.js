import {
  createElement, Bell, BookOpen, Briefcase, Cake, Calendar, CalendarDays, CalendarPlus, Camera, Check,
  ChevronDown, ChevronLeft, ChevronRight, Clock, Cog, Copy, Download, Ellipsis, ExternalLink, Eye, EyeOff, Flag,
  Gift, GraduationCap, Hammer, Heart, Image, ImagePlus, Images, Info, Landmark, LayoutGrid, Link,
  List, ListOrdered, LoaderCircle, Lock, LogOut, Mail, MapPin, Megaphone, MessageCircle, Mountain, Music,
  PartyPopper, Pencil, Phone, Plane, Plus, Repeat, RotateCcw, Search, Settings, Shield, Ship, Star, Tent,
  Trash2, TriangleAlert, Trophy, Upload, User, UserRound, Users, Utensils, Wine, X, Bold, Italic, Bike,
  Rows3, ScrollText, KeyRound, Crosshair, CircleCheck, Hourglass,
} from 'lucide';

const ICONS = {
  bell: Bell, 'book-open': BookOpen, briefcase: Briefcase, cake: Cake, calendar: Calendar,
  'calendar-days': CalendarDays, 'calendar-plus': CalendarPlus, camera: Camera, check: Check,
  'chevron-down': ChevronDown, 'chevron-left': ChevronLeft, 'chevron-right': ChevronRight, clock: Clock,
  cog: Cog, copy: Copy, download: Download, ellipsis: Ellipsis, 'external-link': ExternalLink, eye: Eye,
  'eye-off': EyeOff, flag: Flag, gift: Gift, 'graduation-cap': GraduationCap, hammer: Hammer,
  heart: Heart, image: Image, 'image-plus': ImagePlus, images: Images, info: Info, landmark: Landmark,
  'layout-grid': LayoutGrid, link: Link, list: List, 'list-ordered': ListOrdered, loader: LoaderCircle,
  lock: Lock, 'log-out': LogOut, mail: Mail, 'map-pin': MapPin, megaphone: Megaphone,
  'message-circle': MessageCircle, mountain: Mountain, music: Music, 'party-popper': PartyPopper,
  pencil: Pencil, phone: Phone, plane: Plane, plus: Plus, repeat: Repeat, 'rotate-ccw': RotateCcw,
  search: Search, settings: Settings, shield: Shield, ship: Ship, star: Star, tent: Tent,
  trash: Trash2, alert: TriangleAlert, trophy: Trophy, upload: Upload, user: User,
  'user-round': UserRound, users: Users, utensils: Utensils, wine: Wine, x: X, bold: Bold,
  italic: Italic, bike: Bike, rows: Rows3, scroll: ScrollText, key: KeyRound, crosshair: Crosshair,
  'circle-check': CircleCheck, hourglass: Hourglass,
};

// Pictogrammes proposés au master pour les catégories d'événements
export const CATEGORY_ICONS = [
  'calendar', 'users', 'landmark', 'utensils', 'wine', 'mountain', 'tent', 'bike', 'ship', 'plane',
  'briefcase', 'graduation-cap', 'hammer', 'cog', 'music', 'party-popper', 'cake', 'gift', 'trophy',
  'star', 'flag', 'heart', 'book-open', 'camera', 'megaphone', 'map-pin',
];

export function icon(name, { size = 20, label = null, className = '' } = {}) {
  const attrs = {
    width: size,
    height: size,
    'stroke-width': 1.75,
    class: ['icon', className].filter(Boolean).join(' '),
    focusable: 'false',
  };
  if (label) {
    attrs.role = 'img';
    attrs['aria-label'] = label;
  } else {
    attrs['aria-hidden'] = 'true';
  }
  return createElement(ICONS[name] ?? Calendar, attrs);
}
