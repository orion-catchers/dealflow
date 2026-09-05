import type { Actor } from "@/contracts/harsh";
import type { AccountStatus, SessionUser } from "@/contracts/ruchir";

const EMAIL_TO_ACTOR_ID: Record<string, string> = {
  "dev@nexa.example": "admin-dev",
  "arjun@nexa.example": "rep-arjun",
  "priya@nexa.example": "rep-priya",
  "sana@nexa.example": "manager-sana",
  "farah@nexa.example": "finance-farah",
  "neha@acme.example": "customer-neha",
  "rohan@beta.example": "customer-rohan",
  "meera@gamma.example": "customer-meera",
  "vikram@nexa.example": "pending-vikram",
};

const EMAIL_TO_CUSTOMER_ID: Record<string, string> = {
  "neha@acme.example": "customer-acme",
  "rohan@beta.example": "customer-beta",
  "meera@gamma.example": "customer-gamma",
};

export const ACTOR_ID_TO_EMAIL: Record<string, string> = Object.fromEntries(
  Object.entries(EMAIL_TO_ACTOR_ID).map(([email, id]) => [id, email]),
);

type DbUser = {
  id: string;
  email: string;
  name: string;
  role: Actor["role"];
  status: AccountStatus;
  memberships: { customerId: string }[];
};

export function actorIdForEmail(email: string, userId: string): string {
  return EMAIL_TO_ACTOR_ID[email] ?? userId;
}

export function customerIdForUser(user: DbUser): string | undefined {
  if (user.role !== "CUSTOMER") return undefined;
  return EMAIL_TO_CUSTOMER_ID[user.email] ?? user.memberships[0]?.customerId;
}

export function userToActor(user: DbUser): Actor {
  return {
    id: actorIdForEmail(user.email, user.id),
    role: user.role,
    customerId: customerIdForUser(user),
    active: user.status === "ACTIVE",
  };
}

export function userToSessionUser(user: DbUser): SessionUser {
  return {
    id: actorIdForEmail(user.email, user.id),
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    customerId: customerIdForUser(user),
    active: user.status === "ACTIVE",
  };
}
