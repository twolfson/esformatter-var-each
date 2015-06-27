// Load in dependencies
var rocambole = require('rocambole');
var rocamboleToken = require('rocambole-token');

// Handle setting of options
var options;
exports.setOptions = function (_options) {
  options = _options;
};

// Define our transform function
exports._transformNode = function (node) {
  // If the token is not a variable declaration (e.g. `var`, `let`), exit early
  // https://developer.mozilla.org/en-US/docs/Mozilla/Projects/SpiderMonkey/Parser_API
  // interface VariableDeclaration <: Declaration {
  //     type: "VariableDeclaration";
  //     declarations: [ VariableDeclarator ];
  //     kind: "var" | "let" | "const";
  // }
  // interface VariableDeclarator <: Node {
  //   type: "VariableDeclarator";
  //   id: Pattern;
  //   init: Expression | null;
  // }
  if (node.type !== 'VariableDeclaration') {
    return node;
  }

  // If we are inside of a loop, do nothing (e.g. `for`, `while`, `do ... while`)
  // DEV: Technically, a while/dowhile can't have a `var` but this is for good measure
  var parentType = node.parent ? node.parent.type : '';
  if (parentType.match(/WhileStatement|DoWhileStatement|ForStatement|ForInStatement/)) {
    return node;
  }

  // Determine the terminating character
  // Example: `var foo = bar;`
  //   varDeclaration = {type: VariableDeclaration, declarations: [...], kind: 'var'}
  //   declarators[*] = {type: VariableDeclarator, id: {type: Identifier, name: 'foo'}, init: {type: Literal, value: 'bar'}}
  var varDeclaration = node;
  var declarators = varDeclaration.declarations;

  // Generate a `var` for each of the declarators
  // e.g. `var hello = 'world', goodbye = 'moon';` -> `var hello = 'world'; var goodbye = 'moon';`
  var declarations = declarators.map(function generateDeclaration (declarator, index) {
    // Generate a new delcaration similar to the original
    // Example: `var hello = 'world', goodbye = 'moon';` should use `var` and have a trailing semicolon `;`
    var declaration = {
      type: varDeclaration.type, // should always be `VariableDeclaration`
      declarations: [declarator],
        // link to declaration's tokens
      kind: varDeclaration.kind, // (e.g. `var`, `let`)
      // prev: connect to `declarations[i - 1]` or if first, original var's `prev`
      // next: connect to `declarations[i + 1]` or if last, original var's `next`

      // These tokens will be connected via rocambole-token
      startToken: {
        type: varDeclaration.startToken.type, // should always be `Keyword`
        value: varDeclaration.startToken.value // (e.g. `var`, `let`)
      },
      endToken: {
        // TODO: Add back alternative endings
        type: 'Punctuation', // (e.g. `Punctuation`, `LineBreak`)
        value: ';' // (e.g. `;`, '\n')
      }
    };

    // Return the declaration
    return declaration;
  });

  console.log(node.parent.toString());

  // Return the updated node
  return node;
};

// Export our transformation
// https://github.com/millermedeiros/esformatter/tree/v0.4.3#transformbeforeast
exports.transform = function (ast) {
  rocambole.moonwalk(ast, exports._transformNode);
};
