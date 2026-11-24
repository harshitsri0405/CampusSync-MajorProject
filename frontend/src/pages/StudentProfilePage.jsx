import { useEffect, useState } from 'react'
import { ArrowLeft, Pencil, User } from 'lucide-react'
import { getStudentProfile, saveStudentProfile } from '../api.js'

const GENDERS = ['Male', 'Female', 'Other']
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

const SECTIONS = [
  {
    title: 'Personal Information',
    fields: [
      { name: 'date_of_birth', label: 'Date of Birth', type: 'date' },
      { name: 'gender', label: 'Gender', type: 'select', options: GENDERS },
      { name: 'blood_group', label: 'Blood Group', type: 'select', options: BLOOD_GROUPS },
    ],
  },
  {
    title: 'Academic Information',
    fields: [
      { name: 'course', label: 'Course', type: 'text', placeholder: 'e.g. B.Tech CSE' },
      { name: 'department', label: 'Department', type: 'text', placeholder: 'e.g. Computer Science' },
      { name: 'semester', label: 'Semester', type: 'text', placeholder: 'e.g. 5th' },
      { name: 'admission_year', label: 'Admission Year', type: 'text', placeholder: 'e.g. 2023' },
    ],
  },
  {
    title: 'Parent Details',
    fields: [
      { name: 'father_name', label: "Father's Name", type: 'text' },
      { name: 'mother_name', label: "Mother's Name", type: 'text' },
      { name: 'parent_contact', label: 'Parent Contact Number', type: 'text' },
    ],
  },
  {
    title: 'Contact Information',
    fields: [
      { name: 'phone', label: 'Phone Number', type: 'text' },
      { name: 'address', label: 'Address', type: 'textarea', span: 'full' },
    ],
  },
]

const EMPTY_FORM = SECTIONS.flatMap((s) => s.fields).reduce(
  (acc, f) => ({ ...acc, [f.name]: '' }),
  {}
)

export default function StudentProfilePage({ session, onBack }) {
  const [profile, setProfile] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    getStudentProfile(session.access_token)
      .then((data) => {
        if (cancelled) return
        setProfile(data)
        setForm({ ...EMPTY_FORM, ...data })
        setEditing(!data.is_filled)
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [session.access_token])

  function updateField(name, value) {
    setForm((f) => ({ ...f, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const updated = await saveStudentProfile(session.access_token, form)
      setProfile(updated)
      setForm({ ...EMPTY_FORM, ...updated })
      setEditing(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="w-full bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 font-body text-sm"
        >
          <ArrowLeft size={16} /> Back
        </button>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
            <User size={26} className="text-purple-600" />
          </div>
          <div>
            <h1 className="font-display text-2xl text-slate-900">{profile?.name || 'Student Profile'}</h1>
            <p className="font-body text-sm text-slate-500">College ID: {profile?.college_id}</p>
          </div>
          {!editing && !loading && (
            <button
              onClick={() => setEditing(true)}
              className="ml-auto flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 font-body text-sm text-slate-700 hover:bg-slate-50"
            >
              <Pencil size={14} /> Edit
            </button>
          )}
        </div>

        {loading && <p className="font-body text-slate-400">Loading your profile…</p>}
        {!loading && error && <p className="font-body text-sm text-red-600 mb-4">{error}</p>}

        {!loading && editing && (
          <form onSubmit={handleSubmit} className="space-y-8">
            {SECTIONS.map((section) => (
              <div key={section.title} className="bg-white rounded-xl border border-slate-200 p-6">
                <h2 className="font-display text-lg text-slate-900 mb-4">{section.title}</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  {section.fields.map((f) => (
                    <div key={f.name} className={f.span === 'full' ? 'sm:col-span-2' : ''}>
                      <label className="font-body text-sm text-slate-600 mb-1 block">{f.label}</label>
                      {f.type === 'select' ? (
                        <select
                          value={form[f.name] || ''}
                          onChange={(e) => updateField(f.name, e.target.value)}
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                          <option value="">Select {f.label.toLowerCase()}</option>
                          {f.options.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : f.type === 'textarea' ? (
                        <textarea
                          value={form[f.name] || ''}
                          onChange={(e) => updateField(f.name, e.target.value)}
                          rows={3}
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      ) : (
                        <input
                          type={f.type}
                          placeholder={f.placeholder}
                          value={form[f.name] || ''}
                          onChange={(e) => updateField(f.name, e.target.value)}
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-purple-600 hover:bg-purple-700 text-white font-body text-sm font-medium px-5 py-2.5 disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save Profile'}
              </button>
              {profile?.is_filled && (
                <button
                  type="button"
                  onClick={() => {
                    setForm({ ...EMPTY_FORM, ...profile })
                    setEditing(false)
                  }}
                  className="font-body text-sm text-slate-500 hover:text-slate-800"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}

        {!loading && !editing && profile && (
          <div className="space-y-8">
            {SECTIONS.map((section) => (
              <div key={section.title} className="bg-white rounded-xl border border-slate-200 p-6">
                <h2 className="font-display text-lg text-slate-900 mb-4">{section.title}</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  {section.fields.map((f) => (
                    <div key={f.name} className={f.span === 'full' ? 'sm:col-span-2' : ''}>
                      <p className="font-body text-xs text-slate-400">{f.label}</p>
                      <p className="font-body text-sm text-slate-800 mt-0.5">
                        {profile[f.name] || <span className="text-slate-300">Not provided</span>}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}