import { RuleTester } from "eslint";

import rule from "../max-comment-lines.js";

// No TS parser needed: the rule only inspects comment tokens, so espree
// (RuleTester's default) keeps the test runnable without extra deps.
const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

const commentLines = (n: number) =>
  Array.from({ length: n }, () => "// filler").join("\n");

tester.run("cadet/max-comment-lines", rule, {
  valid: [
    // Under the default cap of 100.
    { code: `${commentLines(100)}\nconst x = 1;\n` },
    // Custom cap honored.
    {
      code: `${commentLines(3)}\nconst x = 1;\n`,
      options: [{ max: 3 }],
    },
    // No comments at all.
    { code: `const x = 1;\n` },
  ],
  invalid: [
    {
      code: `${commentLines(101)}\nconst x = 1;\n`,
      errors: [{ messageId: "tooManyCommentLines" }],
    },
    // A multi-line block comment counts every line it spans.
    {
      code: `/*\n${commentLines(3)}\n*/\nconst x = 1;\n`,
      options: [{ max: 3 }],
      errors: [{ messageId: "tooManyCommentLines" }],
    },
  ],
});
