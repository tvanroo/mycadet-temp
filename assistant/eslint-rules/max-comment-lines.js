// Caps the number of comment lines in a file. Comments are a maintenance
// liability at volume; past the cap, the file needs an edit, not an excuse.

const DEFAULT_MAX = 100;

const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Enforce a maximum number of comment lines per file",
    },
    messages: {
      tooManyCommentLines:
        "File has {{count}} comment lines; the cap is {{max}}. Trim comments instead of adding them.",
    },
    schema: [
      {
        type: "object",
        properties: {
          max: { type: "integer", minimum: 1 },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const max = context.options[0]?.max ?? DEFAULT_MAX;

    return {
      Program(node) {
        const commentLines = new Set();
        for (const comment of context.sourceCode.getAllComments()) {
          for (
            let line = comment.loc.start.line;
            line <= comment.loc.end.line;
            line++
          ) {
            commentLines.add(line);
          }
        }
        if (commentLines.size > max) {
          context.report({
            node,
            messageId: "tooManyCommentLines",
            data: { count: String(commentLines.size), max: String(max) },
          });
        }
      },
    };
  },
};

export default rule;
