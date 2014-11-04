var esformatter = require('esformatter');
var esformatterVarEach = require('../');
esformatter.register(esformatterVarEach);

var script = "var a = 'hello', b = 'world'";

var str = esformatter.format(script);

console.log(script);
console.log(str);
