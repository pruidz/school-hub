import { redirect } from "next/navigation";

/**
 * `/kid` is the role home that `homePathForRole()` and the middleware redirect
 * to, so it is where a child lands after every sign-in and after every
 * mis-routed request. The screen they actually want is C1, so send them
 * straight there rather than making them tap through a landing page.
 */
export default function KidHomePage() {
  redirect("/kid/today");
}
