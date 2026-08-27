/** Shapes returned by the FastAPI backend. */

export type User = {
  id: string;
  email: string;
  name: string;
  currency: string;
  locale: string;
  timezone: string;
  onboarded: boolean;
  has_demo_data: boolean;
};

export type ScoreComponent = {
  key: string;
  label: string;
  score: number;
  max: number;
  detail: string;
};

export type HealthScore = {
  score: number;
  grade: string;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  breakdown: ScoreComponent[];
};

export type CategorySpend = {
  category: string;
  amount: number;
  budget: number | null;
  share: number;
};

export type BudgetRow = {
  id?: string;
  category: string;
  amount: number;
  spent: number;
  remaining: number;
  used_pct: number;
  status: "SAFE" | "WARNING" | "OVER";
  month?: number;
  year?: number;
};

export type GoalStatus = "ON_TRACK" | "SLIGHTLY_BEHIND" | "BEHIND" | "COMPLETE";

export type GoalProgress = {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  remaining_amount: number;
  progress_pct: number;
  target_date: string | null;
  months_remaining: number | null;
  required_monthly: number;
  planned_monthly: number;
  status: GoalStatus;
  horizon?: string | null;
  category?: string | null;
  description?: string | null;
  priority?: number;
  completed?: boolean;
  is_demo?: boolean;
  is_emergency_fund?: boolean;
  projected_completion?: string | null;
  months_at_current_pace?: number | null;
  required_savings_rate?: number;
};

export type Holding = {
  id: string;
  name: string;
  ticker: string | null;
  type: string;
  quantity: number;
  avg_buy_price: number;
  current_price: number;
  invested: number;
  current_value: number;
  profit_loss: number;
  profit_loss_pct: number;
  day_change: number | null;
  day_change_pct: number | null;
  price_source: "USER_ENTERED" | "LIVE_MARKET";
  price_updated_at: string | null;
  currency?: string;
  notes?: string | null;
  is_demo?: boolean;
};

export type Portfolio = {
  holdings: Holding[];
  total_invested: number;
  current_value: number;
  profit_loss: number;
  profit_loss_pct: number;
  day_change: number | null;
  allocation: { type: string; value: number; share: number }[];
  best_performer: Holding | null;
  worst_performer: Holding | null;
  has_live_prices: boolean;
  holdings_count: number;
  market_data?: { enabled: boolean; provider: string | null; note: string };
  user_entered_count?: number;
  stale_price_count?: number;
  educational_notes?: string[];
  currency?: string;
};

export type DebtItem = {
  id: string;
  name: string;
  type: string;
  principal: number;
  outstanding: number;
  emi: number;
  interest_rate: number;
  remaining_months: number;
  due_day: number;
  estimated_interest: number;
  payoff_months?: number | null;
  payoff_never?: boolean;
  progress_pct?: number;
  monthly_interest?: number;
};

export type NetWorth = {
  cash: number;
  bank: number;
  savings: number;
  emergency_fund: number;
  investments: number;
  other_assets: number;
  total_assets: number;
  loans: number;
  credit_card: number;
  total_liabilities: number;
  net_worth: number;
};

export type EmergencyFund = {
  current: number;
  monthly_essentials: number;
  min_recommended: number;
  max_recommended: number;
  target_months: number;
  target: number;
  months_covered: number;
  progress_pct: number;
  shortfall: number;
  explanation?: string;
  suggested_monthly?: number;
  status?: string;
  currency_symbol?: string;
  linked_goals?: { id: string; name: string; current_amount: number; target_amount: number }[];
};

export type MonthTotals = {
  month: number;
  year: number;
  label: string;
  income: number;
  expenses: number;
  savings: number;
  invested: number;
};

export type Insight = {
  type: string;
  severity: "INFO" | "WARNING" | "CRITICAL" | "SUCCESS";
  title: string;
  message: string;
  action_url: string | null;
};

export type BuyingGuideItem = {
  name: string;
  bucket: "BUY_NOW" | "PLAN_AND_BUY" | "WAIT" | "AVOID";
  reason: string;
  estimated_amount: number | null;
};

export type UpcomingPayment = {
  title: string;
  amount: number;
  due_day: number;
  days_away: number;
  type: string;
};

export type Dashboard = {
  user_id: string;
  currency: string;
  currency_symbol: string;
  as_of: string;
  month: number;
  year: number;
  month_label: string;
  profile: {
    monthly_salary: number;
    salary_day: number;
    other_monthly_income: number;
    expected_growth_pct: number;
    employment_type: string;
    emergency_fund_months: number;
    target_savings_rate: number;
    inflation_assumption: number;
    investment_return_pct: number;
    risk_tolerance: string;
    bank_balance: number;
    cash_balance: number;
  };
  income: {
    monthly: number;
    recorded_this_month: number;
    planned_monthly: number;
    uses_planned_figure: boolean;
  };
  spend: {
    month_to_date: number;
    last_month: number;
    daily_average: number;
    week_to_date: number;
    today: number;
    projected_month_end: number;
    essentials: number;
    lifestyle: number;
    by_category: CategorySpend[];
    days_elapsed: number;
    days_in_month: number;
    days_left: number;
    transaction_count: number;
    vs_last_month_pct: number;
  };
  fixed_monthly_expenses: number;
  savings: {
    monthly_savings: number;
    savings_rate: number;
    savings_target: number;
    total_saved: number;
    goals: GoalProgress[];
  };
  emergency: EmergencyFund;
  net_worth: NetWorth;
  portfolio: Portfolio;
  debt: {
    total_outstanding: number;
    monthly_emi: number;
    weighted_interest_rate: number;
    debt_to_income_ratio: number;
    estimated_interest_remaining: number;
    items: DebtItem[];
    has_high_interest: boolean;
  };
  goals: GoalProgress[];
  budgets: BudgetRow[];
  history: MonthTotals[];
  disposable_this_month: number;
  safe_to_spend_this_month: number;
  safe_daily_spend: number;
  health_score: HealthScore;
  insights: Insight[];
  buying_guide: BuyingGuideItem[];
  upcoming_payments: UpcomingPayment[];
  unread_notifications: number;
  market_data: { enabled: boolean; provider: string | null; note: string };
  disclaimer: string;
};

export type Expense = {
  id: string;
  amount: number;
  category: string;
  description: string;
  notes: string | null;
  payment_method: string;
  spent_at: string;
  is_fixed: boolean;
  is_recurring: boolean;
  is_demo: boolean;
  created_at: string;
};

export type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
};

export type Allocation = {
  income: number;
  essentials: number;
  family: number;
  debt_payments: number;
  emergency: number;
  savings: number;
  investments: number;
  lifestyle: number;
  buffer: number;
  remaining: number;
  rationale: string[];
  warnings: string[];
  total_allocated: number;
  savings_side_total: number;
  savings_rate: number;
};

export type SavedAllocation = {
  salary: number;
  essentials: number;
  lifestyle: number;
  savings: number;
  investments: number;
  debt_payments: number;
  family: number;
  emergency: number;
  buffer: number;
  source: string;
  updated_at: string;
  total_allocated: number;
  unallocated: number;
};

export type PurchaseFactor = {
  key: string;
  label: string;
  score: number;
  max: number;
  detail: string;
};

export type PurchaseAnalysis = {
  id?: string;
  item_name: string;
  price: number;
  category: string;
  necessity: string;
  score: number;
  verdict: "BUY_NOW" | "PLAN_AND_BUY" | "WAIT" | "SAVE_FIRST" | "AVOID";
  verdict_label: string;
  headline: string;
  reasoning: string[];
  factors: PurchaseFactor[];
  affordable_today: boolean;
  wait_days: number;
  months_to_save: number | null;
  suggested_monthly_saving: number;
  impact: {
    disposable_before: number;
    disposable_after: number;
    savings_before: number;
    savings_after: number;
    savings_rate_after: number;
    emergency_fund_touched: boolean;
    percent_of_monthly_income: number;
    percent_of_disposable: number;
    goal_delay_months: number | null;
    goal_delayed: string | null;
  };
  explanation?: string;
  generated_by: string;
  currency_symbol?: string;
  disclaimer?: string;
  created_at?: string;
  breakdown?: unknown;
};

export type AppNotification = {
  id: string;
  type: string;
  severity: "INFO" | "WARNING" | "CRITICAL" | "SUCCESS";
  title: string;
  message: string;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
};

export type NotificationPrefs = {
  budget_warnings: boolean;
  goal_reminders: boolean;
  savings_reminders: boolean;
  investment_updates: boolean;
  upcoming_payments: boolean;
  monthly_review: boolean;
  unusual_spending: boolean;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  generated_by: string;
  created_at: string;
};

export type Conversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type MonthlyReport = {
  month: number;
  year: number;
  period_label: string;
  currency_symbol: string;
  total_income: number;
  total_expenses: number;
  total_savings: number;
  total_invested: number;
  savings_rate: number;
  health_score: number;
  health_grade: string;
  top_categories: { category: string; amount: number; share: number; budget: number | null }[];
  good_decisions: string[];
  problems: string[];
  next_month_plan: string[];
  summary: string;
  net_worth: number;
  generated_by: string;
};

export type FuturePlan = {
  id: string;
  name: string;
  category: string;
  notes: string | null;
  is_demo: boolean;
  current_cost: number;
  future_cost: number;
  years_away: number;
  months_away: number;
  inflation_pct: number;
  expected_return_pct: number;
  already_saved: number;
  projected_value_of_savings: number;
  gap: number;
  required_monthly_flat: number;
  required_monthly_with_returns: number;
  target_date: string;
  inflation_impact: number;
  affordable_now: boolean;
  explanation: string;
};

export type FinancialProfile = {
  monthly_salary: number;
  salary_day: number;
  other_monthly_income: number;
  expected_growth_pct: number;
  employment_type: string;
  bank_balance: number;
  cash_balance: number;
  existing_savings: number;
  emergency_fund: number;
  other_assets: number;
  emergency_fund_months: number;
  target_savings_rate: number;
  inflation_assumption: number;
  investment_return_pct: number;
  risk_tolerance: string;
};

export type CalendarEvent = {
  date: string;
  type: "SALARY" | "EMI" | "BILL" | "SAVINGS" | "GOAL";
  title: string;
  amount: number;
  direction: "IN" | "OUT" | "NONE";
  category?: string;
};

export type PayoffPlan = {
  method: string;
  steps: { debt_id: string; name: string; order: number; months_to_clear: number; interest_paid: number }[];
  total_months: number;
  total_interest: number;
  explanation: string;
};

export type Options = {
  expense_categories: string[];
  payment_methods: string[];
  income_categories: string[];
  employment_types: string[];
  investment_types: string[];
  debt_types: string[];
  savings_categories: string[];
  goal_horizons: string[];
  future_plan_categories: string[];
  risk_tolerances: string[];
  necessity_levels: string[];
  currencies: string[];
  disclaimer: string;
};
