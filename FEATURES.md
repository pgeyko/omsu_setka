# Potential Features for Setka

Based on the available data and system architecture, the following features can be implemented with minimal impact on performance and database load:

### 1. Smart Filtering & Personalization
- **Subgroup Selection**: Allow users to filter their group's schedule to only show lessons for their specific subgroup (stored locally in `localStorage`).
- **Lesson Highlights**: Highlight specific types of lessons (e.g., "Exam", "Consultation") based on the `type_work` field.

### 2. Enhanced Search & Discovery
- **Recent Auditories/Tutors**: Quick access to recently viewed tutors or rooms, similar to groups.
- **Empty Room Finder**: Using the current time and auditory schedule data, list rooms that are currently free (calculated on the frontend).

### 3. Progressive Web App (PWA) Enhancements
- **Offline Mode**: Cache the last viewed schedules using a Service Worker for access without internet.
- **Home Screen Shortcuts**: Add shortcuts to specific favorite groups directly from the app icon (supported by manifest).

### 4. Advanced Visualizations
- **Building Map Integration**: Link auditory names (e.g., "4-306") to a simple static map or external navigation (since building numbers are consistent).
- **Time Progress Bar**: A visual indicator showing how much time is left in the current lesson.

### 5. Data Analytics (Local)
- **Tutor Workload**: Show how many hours a tutor has on a specific day or week (calculated on the fly from the fetched schedule).
- **Daily Summary**: A brief "Agenda" view for the current day, summarizing total classes and locations.

### 6. Notifications (Client-side)
- **Class Reminders**: Browser notifications 5-10 minutes before a lesson starts (managed by the PWA service worker).
