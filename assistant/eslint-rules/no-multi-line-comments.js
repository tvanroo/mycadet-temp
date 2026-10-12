// A comment must fit on one line. Multi-line block comments read as essays and
// rot; the detail belongs in the code, a test name, or the PR description.

const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow comments that span more than one line",
    },
    messages: {
      multiLineComment:
        "Comment spans {{lines}} lines. Keep comments to one line — put the detail in the code, the test name, or the PR description.",
    },
    schema: [],
  },

  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const span = comment.loc.end.line - comment.loc.start.line + 1;
          if (span > 1) {
            context.report({
              node: comment,
              messageId: "multiLineComment",
              data: { lines: String(span) },
            });
          }
        }
      },
    };
  },
};

export default rule;
