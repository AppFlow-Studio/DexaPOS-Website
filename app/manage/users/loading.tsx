import { UsersDirectorySkeleton } from './components/skeletons'

/**
 * Shaped like the user directory at every width (UI-DESIGN-SYSTEM §4.10). The
 * page renders the same skeleton while its queries load, so the route and
 * in-page states match.
 */
export default function RouteLoading() {
  return <UsersDirectorySkeleton />
}
