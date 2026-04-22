export function EventTimeline({ events }: { events: string[] }) {
  return (
    <aside className="event-timeline panel">
      <p className="eyebrow">Event Timeline</p>
      <h2>초기 런타임 로그</h2>
      <ul>
        {events.map((event) => (
          <li key={event}>{event}</li>
        ))}
      </ul>
    </aside>
  );
}
