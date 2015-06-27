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

  // Find the head and tail of the var declaration for reuse among its declaration clones
  // e.g. `var hello = 'world', goodbye = 'moon';` -> ['var', ' '] = starting tokens; ['hello = world'] = declaration; ...; [';'] = endToken
  var startingTokens = [];
  rocamboleToken.eachInBetween(varDeclaration.startToken, declarators[0].startToken.prev, function saveToken (token) {
    startingTokens.push(token);
  });
  var endingTokens = [];
  rocamboleToken.eachInBetween(declarators[declarators.length - 1].endToken.next, varDeclaration.endToken, function saveToken (token) {
    endingTokens.push(token);
  });

  // Generate a `var` for each of the declarators
  // e.g. `var hello = 'world', goodbye = 'moon';` -> `var hello = 'world'; var goodbye = 'moon';`
  var declarations = [];
  declarators.forEach(function generateDeclaration (declarator, index) {
    // Generate a new declaration similar to the original
    // Example: `var hello = 'world', goodbye = 'moon';` should use `var` and have a trailing semicolon `;`
    // https://github.com/millermedeiros/rocambole/blob/a3d0d63d58b769d13bad288aca32c6e2f7766542/rocambole.js#L69-L74
    var declaration = {
      type: varDeclaration.type, // should always be `VariableDeclaration`
      declarations: [declarator],
      kind: varDeclaration.kind, // (e.g. `var`, `let`)
      toString: varDeclaration.toString
      // prev: bound later
      // next: bound later
      // startToken: bound later
      // endToken: bound later
    };

    // Copy the token chains for our varDeclaration onto the current declaration
    // TODO: Abstract me to `cloneTokenChain: tokens, options: {root}`
    var newStartingTokens = [];
    startingTokens.forEach(function copyTokenChain (token, index) {
      // Clone our token
      var newToken = {
        type: token.type, // e.g. Keyword, Whitespace
        value: token.value, // e.g. 'var', ' '
        root: varDeclaration.parent, // e.g. Program node
        next: undefined,
        prev: undefined
      };

      // If this is the first token, save on the declaration itself
      if (index === 0) {
        declaration.startToken = newToken;
      // Otherwise, connect to the previous token
      } else {
        var lastToken = newStartingTokens[index - 1];
        lastToken.next = newToken;
        newToken.prev = lastToken;
      }

      // Save our tokens
      newStartingTokens.push(newToken);
    });
    var newEndingTokens = [];
    endingTokens.forEach(function copyTokenChain (token, index) {
      // Clone our token
      var newToken = {
        type: token.type, // e.g. Keyword, Whitespace
        value: token.value, // e.g. 'var', ' '
        root: varDeclaration.parent, // e.g. Program node
        next: undefined,
        prev: undefined
      };

      // If this is the last token, save on the declaration itself
      if (index === endingTokens.length - 1) {
        declaration.endToken = newToken;
      }

      // If there is a previous token, connect to it
      if (index > 1) {
        var lastToken = newEndingTokens[index - 1];
        lastToken.next = newToken;
        newToken.prev = lastToken;
      }

      // Save our tokens
      newEndingTokens.push(newToken);
    });

    // Attach declarator's starts/ends to our declaration
    //   Handle node
    declarator.parent = declaration;
    //   Handle tokens
    declarator.startToken.prev = newStartingTokens[newStartingTokens.length - 1];
    newStartingTokens[newStartingTokens.length - 1].next = declarator.startToken;
    declarator.endToken.next = newEndingTokens[0];
    newEndingTokens[0].prev = declarator.endToken;

    console.log('waat', declaration.toString());
    // console.log(declaration.startToken);

    // If this is the first declaration, replace the previous node/token of the original declaration
    // TODO: Is it possible for any of the parents to have the same start token? If so, replace them too
    if (index === 0) {
      // Replace nodes
      var varDeclarationPrevNode = varDeclaration.prev;
      if (varDeclarationPrevNode) {
        varDeclarationPrevNode.next = declaration;
        declaration.prev = varDeclarationPrevNode;
      // TODO: Handle parent's child case
      }

      // Replace tokens
      // https://github.com/millermedeiros/rocambole-token/blob/fc03674b38f288dc545db0a5b2bdfd2d96cab170/remove.js#L10-L23
      var varDeclarationPrevToken = varDeclaration.startToken.prev;
      if (varDeclarationPrevToken) {
        varDeclarationPrevToken.next = declaration.startToken;
        declaration.startToken.prev = varDeclarationPrevToken;
      } else if (varDeclaration.startToken.root) {
        var varDeclarationRootNode = varDeclaration.startToken.root;
        varDeclarationRootNode.startToken = declaration.startToken;
      }
    // Otherwise, connect this to the previous declaration
    } else {

    }

    // If this is the last declaration, replace the next node/token of the original declaration
    // DEV: There is no otherwise case as we take care of that when linking to "previous" declarations

    // Return the declaration
    declarations.push(declaration);
  });

  console.log('FINAL', node.parent.toString());

  // Return the updated node
  return node;
};

// Export our transformation
// https://github.com/millermedeiros/esformatter/tree/v0.4.3#transformbeforeast
exports.transform = function (ast) {
  rocambole.moonwalk(ast, exports._transformNode);
};
