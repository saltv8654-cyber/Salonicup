'use client'
import TeamOfWeekBuilder from '@/app/team-of-week/builder'

export default function AdminToteam() {
  return (
    <div className="max-w-3xl mx-auto pb-24">
      <h1 className="text-xl font-black text-chalk mb-1">🏅 Ομάδα της αγωνιστικής</h1>
      <p className="text-[12px] text-silver mb-4">
        Διάλεξε πρωτάθλημα, βάλε τους παίκτες ανά ομάδα, αποθήκευσε και βγάλε την εικόνα για Instagram.
      </p>
      <TeamOfWeekBuilder />
    </div>
  )
}
