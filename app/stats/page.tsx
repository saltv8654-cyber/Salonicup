import { redirect } from 'next/navigation'

// Το «Σκόρερ» είναι πλέον καρτέλα μέσα στη Βαθμολογία.
export default function StatsRedirect({
  searchParams,
}: { searchParams: { league?: string } }) {
  const q = searchParams.league ? `&league=${searchParams.league}` : ''
  redirect(`/standings?view=scorers${q}`)
}
