// Load in dependencies
var fs = require('fs');
var esformatter = require('esformatter');
var expect = require('chai').expect;
var esformatterVarEach = require('../');

// Register our plugin
esformatter.register(esformatterVarEach);

// Define test utilities
var testUtils = {
  format: function (filepath) {
    before(function formatFn () {
      // Format our content
      var input = fs.readFileSync(filepath, 'utf8');
      this.output = esformatter.format(input);
    });
    after(function cleanup () {
      // Cleanup output
      delete this.output;
    });
  }
};

// Basic variable tests
describe('esformatter-var-each', function () {
  describe('formatting a JS file with comma-last variables', function () {
    testUtils.format(__dirname + '/test-files/basic-comma-last.js');

    it.only('converts each variable to its own `var` statement', function () {
      var expectedOutput = fs.readFileSync(__dirname + '/expected-files/basic-comma-last.js', 'utf8');
      console.log(this.output);
      expect(this.output).to.equal(expectedOutput);
    });
  });

  describe('formatting a JS file with comma-first variables', function () {
    testUtils.format(__dirname + '/test-files/basic-comma-first.js');

    it('converts each variable to its own `var` statement', function () {
      var expectedOutput = fs.readFileSync(__dirname + '/expected-files/basic-comma-first.js', 'utf8');
      expect(this.output).to.equal(expectedOutput);
    });
  });

  describe('formatting a JS file with var-each variables', function () {
    testUtils.format(__dirname + '/test-files/basic-var-each.js');

    it('does nothing', function () {
      var expectedOutput = fs.readFileSync(__dirname + '/expected-files/basic-var-each.js', 'utf8');
      expect(this.output).to.equal(expectedOutput);
    });
  });

  describe('formatting a JS file with variables in loops', function () {
    testUtils.format(__dirname + '/test-files/basic-loops.js');

    it('does nothing', function () {
      var expectedOutput = fs.readFileSync(__dirname + '/expected-files/basic-loops.js', 'utf8');
      expect(this.output).to.equal(expectedOutput);
    });
  });

  describe('formatting a JS file with semicolon-less `var\'s`', function () {
    testUtils.format(__dirname + '/test-files/basic-semicolon-less.js');

    it('does nothing', function () {
      var expectedOutput = fs.readFileSync(__dirname + '/expected-files/basic-semicolon-less.js', 'utf8');
      expect(this.output).to.equal(expectedOutput);
    });
  });

  describe('formatting a JS file with `let` and `const`', function () {
    testUtils.format(__dirname + '/test-files/basic-let-const.js');

    it('converts those to a `var-each` format', function () {
      var expectedOutput = fs.readFileSync(__dirname + '/expected-files/basic-let-const.js', 'utf8');
      expect(this.output).to.equal(expectedOutput);
    });
  });
});

// Intermediate tests
describe('esformatter-var-each', function () {
  describe('formatting a JS file with hoisted variables', function () {
    testUtils.format(__dirname + '/test-files/intermediate-hoisted-vars.js');

    it('converts each variable to its own `var` statement', function () {
      var expectedOutput = fs.readFileSync(__dirname + '/expected-files/intermediate-hoisted-vars.js', 'utf8');
      expect(this.output).to.equal(expectedOutput);
    });
  });

  describe('formatting a JS file with indented variables', function () {
    testUtils.format(__dirname + '/test-files/intermediate-indented-vars.js');

    it('converts each variable to its own `var` statement', function () {
      var expectedOutput = fs.readFileSync(__dirname + '/expected-files/intermediate-indented-vars.js', 'utf8');
      expect(this.output).to.equal(expectedOutput);
    });
  });

  describe('formatting a JS file with indented variables without semicolons', function () {
    testUtils.format(__dirname + '/test-files/intermediate-indented-vars-semicolon-less.js');

    it('converts each variable to its own `var` statement', function () {
      var expectedOutput = fs.readFileSync(__dirname + '/expected-files/intermediate-indented-vars-semicolon-less.js', 'utf8');
      expect(this.output).to.equal(expectedOutput);
    });
  });

  // https://github.com/twolfson/esformatter-var-each/issues/2
  describe.skip('formatting a JS file with indented variables on a var each without semicolons', function () {
    testUtils.format(__dirname + '/test-files/intermediate-indented-var-each-semicolon-less.js');

    it('maintains each `var` statement as its own line', function () {
      var expectedOutput = fs.readFileSync(__dirname + '/expected-files/intermediate-indented-var-each-semicolon-less.js', 'utf8');
      expect(this.output).to.equal(expectedOutput);
    });
  });
});

// Advanced tests
describe('esformatter-var-each', function () {
  describe('formatting multi-line variables', function () {
    testUtils.format(__dirname + '/test-files/advanced-multi-line.js');

    it('converts each variable to its own `var` statement', function () {
      var expectedOutput = fs.readFileSync(__dirname + '/expected-files/advanced-multi-line.js', 'utf8');
      expect(this.output).to.equal(expectedOutput);
    });
  });

  describe('formatting multi-line variables without semicolons', function () {
    testUtils.format(__dirname + '/test-files/advanced-multi-line-semicolon-less.js');

    it('converts each variable to its own `var` statement', function () {
      var expectedOutput = fs.readFileSync(__dirname + '/expected-files/advanced-multi-line-semicolon-less.js', 'utf8');
      expect(this.output).to.equal(expectedOutput);
    });
  });

  describe('formatting semicolon-less variables and no trailing new line', function () {
    testUtils.format(__dirname + '/test-files/advanced-semicolon-less.js');

    it('converts each variable to its own `var` statement', function () {
      var expectedOutput = fs.readFileSync(__dirname + '/expected-files/advanced-semicolon-less.js', 'utf8');
      expect(this.output).to.equal(expectedOutput);
    });
  });
});
