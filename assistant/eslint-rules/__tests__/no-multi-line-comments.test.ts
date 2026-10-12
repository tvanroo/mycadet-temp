import { RuleTester } from "eslint";

import rule from "../no-multi-line-comments.js";

// No TS parser needed: the rule only inspects comment tokens, so espree
// (RuleTester's default) keeps the test runnable without extra deps.
const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

tester.run("cadet/no-multi-line-comments", rule, {
  valid: [
    // A one-line // comment is the whole point.
    { code: `// keep it short\nconst x = 1;\n` },
    // A one-line block comment is fine.
    { code: `/* one line */\nconst x = 1;\n` },
    // A one-line JSDoc is fine.
    { code: `/** one line */\nconst x = 1;\n` },
    // Consecutive // lines are separate one-line comments.
    { code: `// first line\n// second line\nconst x = 1;\n` },
    // No comments at all.
    { code: `const x = 1;\n` },
  ],
  invalid: [
    {
      code: `/**\n * Multi-line docblock.\n */\nconst x = 1;\n`,
      errors: [{ messageId: "multiLineComment" }],
    },
    {
      code: `/* block\n * spanning\n * three lines\n */\nconst x = 1;\n`,
      errors: [{ messageId: "multiLineComment" }],
    },
  ],
});
