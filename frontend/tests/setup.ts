import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom lacks URL.createObjectURL used by CSV download.
if (typeof URL.createObjectURL === "undefined") {
  Object.assign(URL, {
    createObjectURL: vi.fn(() => "blob:mock"),
    revokeObjectURL: vi.fn(),
  });
}

afterEach(() => {
  cleanup();
});
