// Load in dependencies
var rocambole = require('rocambole');
var rocamboleToken = require('rocambole-token');

// Define a helper for creating a generic token
exports.createToken = function (options) {
return {
    type: options.type, // e.g. Keyword, Whitespace
    value: options.value, // e.g. 'var', ' '
    root: options.root || null, // e.g. Program node
    next: null,
    prev: null
  };
};

// Define helper for cloning a token chain
// DEV: The first and last nodes will lack a previous and next node respectively
exports.cloneTokenChain = function (tokens, options) {
  // For each of the tokens
  var newTokens = [];
  tokens.forEach(function copyToken (token, index) {
    // Clone our token
    var newToken = exports.createToken({
      type: token.type, // e.g. Keyword, Whitespace
      value: token.value, // e.g. 'var', ' '
      root: options.root // e.g. Program node
    });

    // If there is a previous token, attach to it
    if (index > 0) {
      var lastToken = newTokens[index - 1];
      lastToken.next = newToken;
      newToken.prev = lastToken;
    }

    // Save our tokens
    newTokens.push(newToken);
  });

  // Return our new tokens
  return newTokens;
};

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
  // Determine whether we use automatic semicolon insertion or not
  var endingSemicolonToken = rocamboleToken.findNext(varDeclaration.endToken, function findStatementTerminator (token) {
    return rocamboleToken.isSemiColon(token) || rocamboleToken.isBr(token);
  });
  if (rocamboleToken.isBr(endingSemicolonToken)) {
    endingSemicolonToken = null;
  }

  // Additionally, find the whitespace tokens before our `var` started (e.g. all indents/whitespace)
  var preStartingTokens = [];
  var token = varDeclaration.startToken.prev;
  while (token) {
    // If the token is whitespace or an indent, save it
    // https://github.com/millermedeiros/rocambole-token/blob/fc03674b38f288dc545db0a5b2bdfd2d96cab170/is.js#L19-L25
    if (token.type === 'WhiteSpace' || token.type === 'Indent') {
      preStartingTokens.unshift(token);
      token = token.prev;
    // Otherwise, stop
    // DEV: We ignore line breaks because this could be the start of a program
    //   Also, line breaks can lead to weird edge cases so we keep it consistent/predictable with a single one
    } else {
      break;
    }
  }

  // Generate a `var` for each of the declarators
  // e.g. `var hello = 'world', goodbye = 'moon';` -> `var hello = 'world'; var goodbye = 'moon';`
  var declarations = declarators.map(function generateDeclaration (declarator, index) {
    // DEV: A brief refresher on nodes and tokens
    //   Nodes are the AST representation of parts of a program (e.g. Identifier, VariableDeclaration)
    //   Tokens are the actual chunks of code these represent (e.g. Keyword, WhiteSpace)
    //   Tokens can be present without there being a node related to them
    //   Nodes have a prev (previous node on the same level), next (next node on the same level),
    //     parent (node containing our node), and sometimes something like a `body` key where they declare child nodes
    //     `body` varies from node type to node type
    //   Tokens don't have levels but are one giant chain
    //   Tokens have next (next token to render), prev (previous token to render),
    //     root (root node of the entire token chain -- i.e. a Program node)
    //   Nodes also have startToken and endToken which are the tokens that a node will start/end on
    //     (e.g. `var` is the start token for a VariableDeclaration)
    //   The only attachment from tokens to nodes is via `range` but this is brittle in rocambole so avoid it

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
  });

  // Set up linkages for nodes
  // DEV: None of these changes will affect the token chain
  //   However, each `node.toString()` is more/less impractical as there are no tokens bound to declarations
  declarations.forEach(function connectNodes (declaration, index) {
    // Attach declaration as the declarator's parent node
    var declarator = declaration.declarations[0];
    declarator.parent = declaration;

    // If this is the first node, connect to var declaration's previous node
    if (index === 0) {
      var varDeclarationPrevNode = varDeclaration.prev;
      if (varDeclarationPrevNode) {
        declaration.prev = varDeclarationPrevNode;
        varDeclarationPrevNode.next = declaration;
      }
    // Otherwise, connect to the last declaration
    } else {
      var lastDeclarationNode = declarations[index - 1];
      declaration.prev = lastDeclarationNode;
      lastDeclarationNode.next = declaration;
    }

    // If this is the last node, connect it to var declaration's next node
    if (index === declarations.length - 1) {
      var varDeclarationNextNode = varDeclaration.next;
      if (varDeclarationNextNode) {
        declaration.next = varDeclarationNextNode;
        varDeclarationNextNode.prev = declaration;
      }
    // Otherwise, do nothing as we will connect to the next node via the previous if/else
    } else {
      // Do nothing
    }

    // In all cases, save this var declaration's parent node as this declaration node's parent
    declaration.parent = varDeclaration.parent;
  });

  // Swap the declarations in the `body` of the parent block statement
  // e.g. `BlockStatement.body = [{orig VariableDeclaration}, some other expressions]`
  //     -> `BlockStatement.body = [{new VariableDeclaration}, {another new VariableDeclaration}, some other expressions]`
  var varDeclarationParentNode = varDeclaration.parent;
  var varDeclarationParentBodyIndex = varDeclarationParentNode.body.indexOf(varDeclaration);
  varDeclarationParentNode.body.splice(varDeclarationParentBodyIndex, 1, declarations);

  // Handle token bindings (aka the annoying/hard part)
  declarations.forEach(function defineAndAttachTokens (declaration, index) {
    // DEV: We have a few linkages to perform:
    //   Example: HEAD; var a = 1, b = 2; TAIL
    //     VariableDeclaration tokens = ['var', ' ', 'a', ' ', '=', ..., ';']
    //     VariableDeclarator tokens = ['a', ' ', '=', ..., '1']
    //   We need to: Link FIRST VariableDeclaration to HEAD
    //   We need to: Link each VariableDeclaration start to VariableDeclarator start
    //   We need to: Link each VariableDeclaration end to VariableDeclarator end
    //   We need to  Insert terminating content for each VariableDeclaration between VariableDeclaration's (e.g. `;\n  `)
    //   We need to: Link LAST VariableDeclaration to TAIL
    // Define our starting tokens (e.g. `['var', ' ']`)
    var declarator = declaration.declarations[0];
    var newStartingTokens = exports.cloneTokenChain(startingTokens, {
      root: varDeclaration.startToken.root /* Always Program node */
    });
    // DEV: This is always defined as we always need a `var` keyword
    declaration.startToken = newStartingTokens[0];

    // FIRST STEP: Link FIRST VariableDeclaration to HEAD
    // If there is a previous token, overwrite previous/next bindings
    var varDeclarationPrevToken = varDeclaration.startToken.prev;
    if (varDeclarationPrevToken) {
      varDeclarationPrevToken.next = declaration.startToken;
      declaration.startToken.prev = varDeclarationPrevToken;
    // Otherwise, we are at the start of the program so update the Program node to consider this token to be the start
    } else {
      declaration.root.startToken = declaration.startToken;
    }

    // SECOND STEP: Link each VariableDeclaration start to VariableDeclarator start
    // Connect the declaration's ending start token to our declarator's tokens
  });
  // var newEndingTokens = exports.cloneTokenChain(endingTokens, {
  //   root: varDeclaration.endToken.root /* Always Program node */
  // });

  // // Attach declarator's starts/ends to our declaration
  // //   Handle node
  // declarator.parent = declaration;
  // //   Handle tokens
  // // DEV: There is always a starting token since we need a `var`
  // declarator.startToken.prev = newStartingTokens[newStartingTokens.length - 1];
  // newStartingTokens[newStartingTokens.length - 1].next = declarator.startToken;
  // // If there are ending tokens (e.g. `;`), then use them
  // if (newEndingTokens.length) {
  //   declarator.endToken.next = newEndingTokens[0];
  //   newEndingTokens[0].prev = declarator.endToken;
  // }

  // // Attach declaration tokens
  // declaration.startToken = newStartingTokens[0];
  // // If there are ending tokens (e.g. `;`), then use them
  // if (newEndingTokens.length) {
  //   declaration.endToken = newEndingTokens[newEndingTokens.length - 1];
  // // Otherwise, use the same end token as the declarator
  // } else {
  //   declaration.endToken = declarator.endToken;
  // }

  // // If this is the first declaration, replace the previous node/token of the original declaration
  // if (index === 0) {
  //   // Replace nodes
  //   var varDeclarationPrevNode = varDeclaration.prev;
  //   if (varDeclarationPrevNode) {
  //     varDeclarationPrevNode.next = declaration;
  //     declaration.prev = varDeclarationPrevNode;
  //   }

  //   // Replace tokens
  //   // https://github.com/millermedeiros/rocambole-token/blob/fc03674b38f288dc545db0a5b2bdfd2d96cab170/remove.js#L10-L23
  //   var varDeclarationPrevToken = varDeclaration.startToken.prev;
  //   if (varDeclarationPrevToken) {
  //     varDeclarationPrevToken.next = declaration.startToken;
  //     declaration.startToken.prev = varDeclarationPrevToken;
  //   } else if (varDeclaration.startToken.root) {
  //     var varDeclarationRootNode = varDeclaration.startToken.root;
  //     varDeclarationRootNode.startToken = declaration.startToken;
  //   }
  // // Otherwise, connect this to the previous declaration
  // } else {
  //   // Attach nodes
  //   var lastDeclaration = declarations[index - 1];
  //   lastDeclaration.next = declaration;
  //   declaration.prev = lastDeclaration;

  //   // If there are prestarting tokens (e.g. whitespace before a `var`), then build/attach them now
  //   var linkingStartToken = declaration.startToken;
  //   var linkingEndToken = declaration.startToken;
  //   if (preStartingTokens.length) {
  //     var newPreStartingTokens = exports.cloneTokenChain(preStartingTokens, {
  //       root: varDeclaration.startToken.prev.root /* Always Program node*/
  //     });
  //     linkingStartToken = newPreStartingTokens[0];
  //     linkingEndToken = newPreStartingTokens[newPreStartingTokens.length - 1];
  //     linkingEndToken.next = declaration.startToken;
  //     declaration.startToken.prev = linkingEndToken;
  //   }

  //   // If there's a newline between declarators, then inject a newline between indentation and the last declaration
  //   if (lineBreakTokenBetweenDeclarators) {
  //     var lineBreakToken = exports.createToken({
  //       type: lineBreakTokenBetweenDeclarators.type, // e.g. 'LineBreak'
  //       value: lineBreakTokenBetweenDeclarators.value, // e.g. '\n', '\r\n'
  //       root: lineBreakTokenBetweenDeclarators.root // e.g. Program node
  //     });
  //     lineBreakToken.next = linkingStartToken;
  //     linkingStartToken.prev = lineBreakToken;
  //     linkingStartToken = lineBreakToken;
  //   }

  //   // Attach tokens
  //   lastDeclaration.endToken.next = linkingStartToken;
  //   linkingEndToken.prev = lastDeclaration.endToken;
  // }

  // // If this is the last declaration, replace the next node/token of the original declaration
  // // DEV: There is no otherwise case as we take care of that when linking to "previous" declarations
  // if (index === declarators.length - 1) {
  //   // Replace nodes
  //   var varDeclarationNextNode = varDeclaration.next;
  //   if (varDeclarationNextNode) {
  //     varDeclarationNextNode.prev = declaration;
  //     declaration.next = varDeclarationNextNode;
  //   }

  //   // Replace tokens
  //   // https://github.com/millermedeiros/rocambole-token/blob/fc03674b38f288dc545db0a5b2bdfd2d96cab170/remove.js#L10-L23
  //   var varDeclarationNextToken = varDeclaration.endToken.next;
  //   if (varDeclarationNextToken) {
  //     varDeclarationNextToken.prev = declaration.endToken;
  //     declaration.endToken.next = varDeclarationNextToken;
  //   } else if (varDeclaration.endToken.root) {
  //     var varDeclarationRootNode = varDeclaration.endToken.root;
  //     varDeclarationRootNode.endToken = declaration.endToken;
  //   }
  // }

  console.log('FINAL', node.parent.toString());

  // Return the updated node
  return node;
};

// Export our transformation
// https://github.com/millermedeiros/esformatter/tree/v0.4.3#transformbeforeast
exports.transform = function (ast) {
  rocambole.moonwalk(ast, exports._transformNode);
};
