import {
  ShieldCheck,
  Users,
  GraduationCap,
  Building2,
  User,
  Hash,
  Landmark,
  MapPin,
  Map,
  Globe,
  Mail,
  Phone,
} from 'lucide-react'

const REGISTRY = {
  ShieldCheck,
  Users,
  GraduationCap,
  Building2,
  User,
  Hash,
  Landmark,
  MapPin,
  Map,
  Globe,
  Mail,
  Phone,
}

export default function DynamicIcon({ name, ...props }) {
  const Cmp = REGISTRY[name] || User
  return <Cmp {...props} />
}
