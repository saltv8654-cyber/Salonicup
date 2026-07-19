import { redirect } from 'next/navigation'

// Οι αγώνες είναι πλέον η αρχική σελίδα.
export default function MatchesRedirect({
  searchParams,
}: { searchParams: { date?: string } }) {
  redirect(searchParams.date ? `/?date=${searchParams.date}` : '/')
}
