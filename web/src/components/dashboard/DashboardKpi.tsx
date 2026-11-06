import type { LucideIcon } from 'lucide-react';

interface Props {
  title: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  testId: string;
}

/** Same metric typography and spacing for each role's workspace. */
export default function DashboardKpi({ title, value, detail, icon: Icon, testId }: Props) {
  return <>
    <span className="dashboard-kpi-icon"><Icon strokeWidth={1.7} aria-hidden="true" /></span>
    <p className="dashboard-kpi-label">{title}</p>
    <p className="dashboard-kpi-value" data-testid={testId}>{value}</p>
    <p className="dashboard-kpi-detail">{detail}</p>
  </>;
}
