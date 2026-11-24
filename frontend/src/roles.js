// Single source of truth for the 4 modules. Each role drives:
//  - the role-selection card (icon, accent, description)
//  - the registration wizard's "Details" step fields
//  - the sign-in username field
export const ROLES = {
  admin: {
    key: 'admin',
    wing: 'Admin',
    setupLabel: 'Admin Account Setup',
    description: 'Manage the entire campus operations',
    accent: '#2563EB',
    tint: '#EFF4FF',
    icon: 'ShieldCheck',
    usernameField: 'college_name',
    usernameLabel: 'College / Institution Name',
    detailsTitle: 'Institution Details',
    detailsIcon: 'Landmark',
    detailsFields: [
      { name: 'college_name', label: 'College / Institution Name', placeholder: 'Enter college or institution name', icon: 'Landmark' },
      { name: 'college_code', label: 'College Code', placeholder: 'Enter college code', icon: 'Hash' },
      { name: 'address', label: 'Address', placeholder: 'Enter full address of the institution', icon: 'MapPin', span: 'full' },
      { name: 'city', label: 'City', placeholder: 'Enter city', icon: 'Landmark' },
      { name: 'state_name', label: 'State', placeholder: 'Select state', icon: 'Map' },
      { name: 'country', label: 'Country', placeholder: 'Select country', icon: 'Globe' },
      { name: 'email', label: 'Email', placeholder: 'Enter official email', icon: 'Mail' },
      { name: 'contact_number', label: 'Contact Number', placeholder: 'Enter contact number', icon: 'Phone' },
    ],
    // Fields actually wired to the backend today (see api.js note). The rest
    // are collected for the review step and will be persisted once the
    // matching columns exist on your side.
    backendFields: ['college_name', 'college_code', 'address', 'city', 'state_name', 'country', 'email', 'contact_number'],
  },
  faculty: {
    key: 'faculty',
    wing: 'Faculty',
    setupLabel: 'Faculty Account Setup',
    description: 'Manage classes, students & academics',
    accent: '#16A34A',
    tint: '#EEFBF3',
    icon: 'Users',
    usernameField: 'faculty_id',
    usernameLabel: 'Faculty ID',
    detailsTitle: 'Faculty Details',
    detailsIcon: 'Users',
    detailsFields: [
      { name: 'faculty_name', label: 'Full Name', placeholder: 'Enter your full name', icon: 'User' },
      { name: 'faculty_id', label: 'Faculty ID', placeholder: 'Enter your faculty ID', icon: 'Hash' },
    ],
    backendFields: ['faculty_name', 'faculty_id'],
  },
  student: {
    key: 'student',
    wing: 'Student',
    setupLabel: 'Student Account Setup',
    description: 'Access courses, assignments & more',
    accent: '#7C3AED',
    tint: '#F5F0FF',
    icon: 'GraduationCap',
    usernameField: 'college_id',
    usernameLabel: 'College ID',
    detailsTitle: 'Personal Details',
    detailsIcon: 'GraduationCap',
    detailsFields: [
      { name: 'name', label: 'Full Name', placeholder: 'Enter your full name', icon: 'User' },
      { name: 'college_id', label: 'College ID', placeholder: 'Enter your college ID', icon: 'Hash' },
    ],
    backendFields: ['name', 'college_id'],
  },
  hostel: {
    key: 'hostel',
    wing: 'Hostel',
    setupLabel: 'Hostel Account Setup',
    description: 'Manage hostel facilities & services',
    accent: '#F97316',
    tint: '#FFF4EC',
    icon: 'Building2',
    usernameField: 'faculty_id',
    usernameLabel: 'Warden Staff ID',
    detailsTitle: 'Hostel & Warden Details',
    detailsIcon: 'Building2',
    detailsFields: [
      { name: 'warden_name', label: 'Warden Name', placeholder: 'Enter warden name', icon: 'User' },
      { name: 'faculty_id', label: 'Warden Staff ID', placeholder: 'Enter warden staff ID', icon: 'Hash' },
      { name: 'hostel_name', label: 'Hostel Name', placeholder: 'Enter hostel name', icon: 'Building2' },
    ],
    backendFields: ['warden_name', 'faculty_id', 'hostel_name'],
  },
}

export const ROLE_ORDER = ['admin', 'faculty', 'student', 'hostel']

export function generatePassword(length = 12) {
  const chars =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'
  let out = ''
  const arr = new Uint32Array(length)
  window.crypto.getRandomValues(arr)
  for (let i = 0; i < length; i++) out += chars[arr[i] % chars.length]
  return out
}

// Individual checklist rules shown on the Account Security step.
export function passwordChecks(pw) {
  return [
    { label: 'At least 8 characters', pass: pw.length >= 8 },
    { label: 'Contains uppercase letter', pass: /[A-Z]/.test(pw) },
    { label: 'Contains lowercase letter', pass: /[a-z]/.test(pw) },
    { label: 'Contains number', pass: /[0-9]/.test(pw) },
    { label: 'Contains special character', pass: /[^A-Za-z0-9]/.test(pw) },
  ]
}

export function passwordStrength(pw) {
  if (!pw) return { score: 0, label: '' }
  const passed = passwordChecks(pw).filter((c) => c.pass).length
  if (passed <= 2) return { score: passed, label: 'Weak' }
  if (passed <= 4) return { score: passed, label: 'Okay' }
  return { score: passed, label: 'Strong' }
}
