export interface DailyData {
  date: string;
  count: number;
}

export interface DayStats {
  [key: string]: {
    min: number;
    max: number;
  };
}

export interface MonthStats {
  [key: string]: {
    count: number;
  };
}
export type WeekStats = DayStats;

export interface SidebarProps {
    period: 'month' | 'year';
    granularity: 'day' | 'week' | 'month';
    graphType: 'bar' | 'experimental';
    startDate: string;
    minDate: string;
    maxDate: string;
    showSubgraphs: boolean;
    onPeriodChange: (period: 'month' | 'year') => void;
    onGranularityChange: (granularity: 'day' | 'week' | 'month') => void;
    onGraphTypeChange: (graphType: 'bar'  | 'experimental') => void;
    onStartDateChange: (date: string) => void;
    onShowSubgraphsChange: (show: boolean) => void;
  }

export interface MainProps {
    filteredData: DailyData[];
    allData: DailyData[];
    currentStartDate: string;
    period: string;
    granularity: 'day' | 'week' | 'month';
    graphType: 'bar' | 'experimental';
    loading: boolean;
    dayStats: DayStats;
    monthStats: MonthStats;
    weekStats: WeekStats;
    showSubgraphs: boolean;
  }