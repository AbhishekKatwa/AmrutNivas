/**
 * The drift gate between the menu and the router.
 *
 * `navigation.ts` and `routes.ts` are two lists of the same thing — the destinations
 * this build actually has — and the donor project's lesson is that two lists of one
 * fact disagree eventually. So each direction is checked: a live row that points at no
 * route is a 404 in a menu, and a route with no row is a screen nobody can navigate to
 * (which is how a half-built feature ships and stays invisible).
 */
import { describe, expect, it } from "vitest";
import { allNavItems } from "./navigation";
import { ROUTES } from "./routes";

const paths = ROUTES.map((route) => route.path);

describe("the route table against the navigation registry", () => {
  it("registers every component as a real function", () => {
    // A default-import that names nothing resolves to `undefined`, compiles under a
    // loose alias, and then throws only when a person clicks the row.
    const broken = ROUTES.filter((route) => typeof route.component !== "function");
    expect(broken.map((route) => route.path)).toEqual([]);
  });

  it("declares each path once", () => {
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("routes every live navigation row", () => {
    const dead = allNavItems().filter((item) => item.available && !paths.includes(item.path ?? ""));
    expect(dead.map((item) => item.labelKey)).toEqual([]);
  });

  it("offers a menu row for every route a person could need", () => {
    // "/" is the shell's landing and needs no row of its own beyond Command Center.
    const linked = new Set(
      allNavItems().filter((item) => item.available).map((item) => item.path),
    );
    const orphans = paths.filter((path) => path !== "/" && !linked.has(path));
    expect(orphans).toEqual([]);
  });

  it("never gives a disabled row a path", () => {
    // A disabled row renders no anchor, so a path on one is a claim nothing honours.
    const lying = allNavItems().filter((item) => !item.available && item.path !== undefined);
    expect(lying.map((item) => item.labelKey)).toEqual([]);
  });
});
