import {
  BarChart3,
  Bell,
  Bot,
  CalendarDays,
  CreditCard,
  Landmark,
  LayoutDashboard,
  PiggyBank,
  Receipt,
  Settings,
  ShoppingCart,
  Target,
  Telescope,
  TrendingUp,
  Wallet,
} from "lucide-react";

export const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/salary-planner", label: "Salary Planner", icon: Wallet },
  { to: "/expenses", label: "Expenses", icon: Receipt },
  { to: "/budget", label: "Budget", icon: BarChart3 },
  { to: "/savings", label: "Savings", icon: PiggyBank },
  { to: "/investments", label: "Investments", icon: TrendingUp },
  { to: "/goals", label: "Goals", icon: Target },
  { to: "/debt", label: "Debt", icon: CreditCard },
  { to: "/future-planner", label: "Future Planner", icon: Telescope },
  { to: "/decisions", label: "Can I Buy This?", icon: ShoppingCart },
  { to: "/reports", label: "Reports", icon: Landmark },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/coach", label: "AI Finance Coach", icon: Bot },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

/** The five destinations that fit a phone bottom bar. */
export const MOBILE_NAV = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard },
  { to: "/expenses", label: "Expenses", icon: Receipt },
  { to: "/decisions", label: "Can I Buy", icon: ShoppingCart },
  { to: "/savings", label: "Savings", icon: PiggyBank },
  { to: "/coach", label: "Coach", icon: Bot },
] as const;

export const CATEGORY_LABELS: Record<string, string> = {
  FOOD: "Food",
  RENT: "Rent",
  TRAVEL: "Travel",
  SHOPPING: "Shopping",
  BILLS: "Bills",
  ENTERTAINMENT: "Entertainment",
  EDUCATION: "Education",
  HEALTH: "Health",
  FAMILY: "Family",
  SUBSCRIPTIONS: "Subscriptions",
  OTHER: "Other",
};

export const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  DEBIT_CARD: "Debit card",
  CREDIT_CARD: "Credit card",
  BANK_TRANSFER: "Bank transfer",
  OTHER: "Other",
};

export const INVESTMENT_LABELS: Record<string, string> = {
  STOCK: "Stock",
  MUTUAL_FUND: "Mutual fund",
  ETF: "ETF",
  GOLD: "Gold",
  FD: "Fixed deposit",
  CRYPTO: "Crypto",
  OTHER: "Other",
};

export const DEBT_LABELS: Record<string, string> = {
  PERSONAL_LOAN: "Personal loan",
  HOME_LOAN: "Home loan",
  VEHICLE_LOAN: "Vehicle loan",
  EDUCATION_LOAN: "Education loan",
  CREDIT_CARD: "Credit card",
  OTHER: "Other",
};

export const SAVINGS_LABELS: Record<string, string> = {
  EMERGENCY: "Emergency fund",
  GADGET: "Gadget",
  VEHICLE: "Vehicle",
  EDUCATION: "Education",
  TRAVEL: "Travel",
  FAMILY: "Family",
  HOME: "Home",
  GENERAL: "General",
};

export const HORIZON_LABELS: Record<string, string> = {
  SHORT: "Short term",
  MEDIUM: "Medium term",
  LONG: "Long term",
};

export const HORIZON_RANGE: Record<string, string> = {
  SHORT: "0-2 years",
  MEDIUM: "2-5 years",
  LONG: "5+ years",
};

export const FUTURE_PLAN_LABELS: Record<string, string> = {
  VEHICLE: "Vehicle",
  EDUCATION: "Higher education",
  BUSINESS: "Starting a business",
  HOUSE: "Buying a house",
  MARRIAGE: "Marriage",
  TRAVEL: "Travel",
  RETIREMENT: "Retirement",
  INDEPENDENCE: "Financial independence",
  OTHER: "Other",
};

export const EMPLOYMENT_LABELS: Record<string, string> = {
  SALARIED: "Salaried",
  FREELANCE: "Freelance / contract",
  BUSINESS: "Business owner",
  STUDENT: "Student",
  OTHER: "Other",
};

export const INCOME_LABELS: Record<string, string> = {
  SALARY: "Salary",
  FREELANCE: "Freelance",
  BONUS: "Bonus",
  INTEREST: "Interest",
  RENTAL: "Rental",
  GIFT: "Gift",
  OTHER: "Other",
};

export const RISK_LABELS: Record<string, string> = {
  CONSERVATIVE: "Conservative",
  MODERATE: "Moderate",
  AGGRESSIVE: "Aggressive",
};

export const RISK_DESCRIPTIONS: Record<string, string> = {
  CONSERVATIVE: "Smaller share to investments, larger cash buffer.",
  MODERATE: "Balanced split between saving and investing.",
  AGGRESSIVE: "Larger share to investments once the emergency fund is funded.",
};

export const NECESSITY_LABELS: Record<string, string> = {
  NEED: "Need",
  WANT: "Want",
  MIXED: "Bit of both",
};

export const VERDICT_LABELS: Record<string, string> = {
  BUY_NOW: "Buy now",
  PLAN_AND_BUY: "Plan and buy",
  WAIT: "Wait",
  SAVE_FIRST: "Save first",
  AVOID: "Avoid",
};

export const GOAL_STATUS_LABELS: Record<string, string> = {
  ON_TRACK: "On track",
  SLIGHTLY_BEHIND: "Slightly behind",
  BEHIND: "Significantly behind",
  COMPLETE: "Reached",
};

/** Chart palette, resolved from CSS variables so it follows the theme. */
export const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-6))",
];

export const CATEGORY_COLORS: Record<string, string> = {
  FOOD: "hsl(var(--chart-1))",
  RENT: "hsl(var(--chart-2))",
  TRAVEL: "hsl(var(--chart-3))",
  SHOPPING: "hsl(var(--chart-4))",
  BILLS: "hsl(var(--chart-5))",
  ENTERTAINMENT: "hsl(var(--chart-6))",
  EDUCATION: "hsl(var(--chart-2))",
  HEALTH: "hsl(var(--chart-3))",
  FAMILY: "hsl(var(--chart-4))",
  SUBSCRIPTIONS: "hsl(var(--chart-5))",
  OTHER: "hsl(var(--muted-foreground))",
};

export const DISCLAIMER =
  "Finance Track is a personal finance planning and educational tool, not a licensed financial advisor. Projections are estimates based on the assumptions you provide. Investment values fluctuate, and past performance does not guarantee future results.";

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
