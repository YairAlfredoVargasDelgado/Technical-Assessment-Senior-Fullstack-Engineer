import { redirect } from 'next/navigation';

/** The application has one screen; the root sends you to it. */
export default function HomePage() {
  redirect('/jobs');
}
