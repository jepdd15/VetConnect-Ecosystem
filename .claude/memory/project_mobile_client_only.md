---
name: Mobile app is client-only — no staff/vet/admin mobile app
description: The VetConnect mobile app (VetConnect/) is exclusively for pet-owner clients. Staff/vet/admin users use the web admin dashboard (VetConnect-Admin/) only. The staff routing in App.js (StaffDashboard, StaffAppointments, ManageQueue, Scanner, Consultation) is deprecated/dead code. CLAUDE.md still describes role-based routing but this decision was made in prior sessions.
type: project
originSessionId: 6aabc38f-f3fb-4eb1-ab1e-bfea9783fc2e
---
The VetConnect mobile app is **client-only**. The staff/vet/admin mobile app is cancelled/deprecated.

- **Mobile app (VetConnect/):** Pet owners only. Screens: ClientDashboard, MyPets, BookAppointment, ClientAppointments (My Bookings), PetHistory, QueueScreen, ChatbotScreen, PetHistoryAISheet.
- **Admin dashboard (VetConnect-Admin/):** All clinic staff — vets, groomers, receptionists, admins. This is the only interface for clinical work.
- **Staff routing in App.js** (StaffDashboard → StaffAppointments, ManageQueue, Scanner, Consultation) exists in code but is deprecated. Do not reference it as active functionality.

**Why:** CLAUDE.md says "users with role/accessLevel of admin, staff, veterinarian, or groomer route to StaffDashboard" — this is outdated. The decision was made that clinics use the web dashboard, not a mobile app, for clinical operations.

**How to apply:** When discussing mobile features, frame them for pet owners, not vets. When discussing clinical features, they belong on the admin web dashboard only. Don't assume mobile users have clinical knowledge — use plain language, not medical jargon. Features like vitals charts on mobile serve pet owner engagement, not clinical decision-making.
