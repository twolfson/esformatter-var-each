// Load in dependencies
var rocambole = require('rocambole');
var rocamboleToken = require('rocambole-token');

// Define a helper for creating a generic token
exports.createToken = exports.cloneToken = function (options) {
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
    var newToken = exports.cloneToken(token);

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

  // Copy over the preStartingTokens as betweenDeclarationTokens and add in `;` (if applicable) and `\n`
  // DEV: We add from the left of the queue so `\n` then `;` to get `[';', '\n', ' ']`
  var betweenDeclarationTokens = preStartingTokens.slice();
  betweenDeclarationTokens.unshift(exports.createToken({
    type: 'LineBreak',
    value: options.lineBreak.value,
    root: varDeclaration.startToken.root
  }));
  if (endingSemicolonToken) {
    betweenDeclarationTokens.unshift(exports.cloneToken(endingSemicolonToken));
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
    return declaration;
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
    //   We need to: Define STARTING tokens for each VariableDeclaration (e.g. `var ` for `var a = 1`)
    //     Substeps here: If this is the first VariableDeclaration
    //       Subssteps here: Replace ORIGINAL VariableDeclaration linkage with FIRST VariableDeclaration to HEAD (e.g. reuse the existing `var ` token chain)
    //     Substeps here: Otherwise, (we are a non-first VariableDeclaration)
    //       Substesps here : Insert leading content for each non-first VariableDeclaration between VariableDeclaration's
    //         Substeps here: Create `var ` tokens
    //         Substeps here: Attach FIRST `var ` token TO last VariableDeclaration END token
                // TODO: This will only work if the last VariableDeclaration.endToken is the true end of their chain
    //         Substeps here: Attach LAST `var ` token AS current VariableDeclaration START token
    //   We need to: Define ENDING tokens for each VariableDeclaration (e.g. `;\n  ` for `var a = 1;\n  `)
    //     Substeps here: If this is a non-last VariableDeclaration
    //       Substeps here: Insert terminating content for each VariableDeclaration between VariableDeclaration's (e.g. `;\n  `)
    //         Substeps here: Create `;\n  ` tokens
    //         Substeps here: Attach FIRST `;\n  ` token to current VariableDeclaration
    //         Substeps here: Attach LAST `;\n  ` token to next VariableDeclaration
    //     Substeps here: Otherwise, (we are the last VariableDeclaration)
    //        Substeps here: Replace ORIGINAL VariableDeclaration linkage with LAST VariableDeclaration to TAIL
    //   We need to: Link each VariableDeclaration start to VariableDeclarator start (except for first, this is already linked)
    //   We need to: Link each VariableDeclaration end to VariableDeclarator end (except for last, this is already linked)
    // Define our starting tokens (e.g. `['var', ' ']`)
    var declarator = declaration.declarations[0];
    var newStartingTokens = exports.cloneTokenChain(startingTokens);
    // DEV: This is always defined as we always need a `var` keyword
    declaration.startToken = newStartingTokens[0];

    // FIRST STEP: Replace ORIGINAL VariableDeclaration linkage with FIRST VariableDeclaration to HEAD
    // DEV: These are already linked to the desired
    if (index === 0) {
      var firstDeclarator = varDeclaration.declarations[index];
      firstDeclarator.prev  = declaration.startToken;
      if (varDeclarationPrevToken) {
        varDeclarationPrevToken.next = _lastStartToken;
        _lastStartToken.prev = varDeclarationPrevToken;
      // Otherwise, we are at the start of the program so update the Program node to consider this token to be the start
      } else {
        _lastStartToken.root.startToken = _lastStartToken;
      }
    }

    // SECOND STEP: Link each VariableDeclaration start to VariableDeclarator start
    declarator.startToken.prev = _lastStartToken;
    _lastStartToken.next = declarator.startToken;

    // THIRD STEP: Insert terminating content for each VariableDeclaration between VariableDeclaration's (e.g. `;\n  `)
    // DEV: This must come before the `end`/`TAIL` steps as we need an `endToken` to point to on those steps
    // SUBSTEP: Create `;\n  ` tokens
    var newBetweenTokens = exports.cloneTokenChain(betweenDeclarationTokens);

    // SUBSTEP: If this is the non-last VariableDeclaration
    var _firstEndToken, _lastEndToken;
    if (index !== declarations.length - 1) {
      // SUBSTEP: Attach FIRST `;\n  ` token to current VariableDeclaration
      declaration.endToken = _firstEndToken = newBetweenTokens[0];

      // SUBSTEP: Attach LAST `;\n  ` token to next VariableDeclaration
      var nextDeclaration = declarations[index + 1];
      nextDeclaration.startToken = _lastEndToken = newBetweenTokens[newBetweenTokens.length - 1];
    // SUBSTEP: Otherwise, this is the last so consider all of these parts as part of our chain
    } else {
      // SUBSTEP: Attach FIRST `;\n  ` token to current VariableDeclaration
      _firstEndToken = newBetweenTokens[0];

      // SUBSTEP: Update END TOKEN to be LAST `;\n  ` token for current VariableDeclaration
      declaration.endToken = _lastEndToken = newBetweenTokens[newBetweenTokens.length - 1];
    }

    // FOURTH STEP: Link each VariableDeclaration end to VariableDeclarator end
    declarator.endToken.next = _firstEndToken;
    _firstEndToken.prev = declarator.endToken;

    // FIFTH STEP: Link LAST VariableDeclaration to TAIL
    // If there is a next token, overwrite previous/next bindings
    var varDeclarationNextToken = varDeclaration.endToken.next;
    console.log(varDeclaration.endToken.next);
    if (varDeclarationNextToken) {
      varDeclarationNextToken.prev = _lastEndToken;
      _lastEndToken.next = varDeclarationNextToken;
    // Otherwise, we are at the end of the program so update the Program node to consider this token to be the end
    } else {
      console.log(_lastEndToken.root.endToken);
      _lastEndToken.root.endToken = _lastEndToken;
    }
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
