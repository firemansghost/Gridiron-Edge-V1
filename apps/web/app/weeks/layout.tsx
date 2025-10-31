export default function WeeksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // HeaderNav and Footer are already included in WeekPage and WeekReviewPage components
  // No need to duplicate them here
  return <>{children}</>;
}
