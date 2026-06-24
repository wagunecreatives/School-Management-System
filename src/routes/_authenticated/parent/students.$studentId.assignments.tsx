import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute(
  '/_authenticated/parent/students/$studentId/assignments',
)({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div>Hello "/_authenticated/parent/students/$studentId/assignments"!</div>
  )
}
