import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import fs from 'fs';
const traverse = _traverse.default;
const code = fs.readFileSync('src/App.jsx','utf8');
const ast = parse(code,{sourceType:'module',plugins:['jsx']});

let appBody=null;
traverse(ast,{ VariableDeclarator(p){ if(p.node.id.name==='App'){ appBody=p.node.init.body; p.stop(); } } });

// top-level statements of App body
const declLine = {}; // name -> line declared
const stmts = appBody.body;
for(const st of stmts){
  if(st.type==='VariableDeclaration') for(const d of st.declarations){
    if(d.id.type==='Identifier') declLine[d.id.name]=st.loc.start.line;
    else if(d.id.type==='ArrayPattern') for(const e of d.id.elements){ if(e&&e.type==='Identifier') declLine[e.name]=st.loc.start.line; }
    else if(d.id.type==='ObjectPattern') for(const pr of d.id.properties){ if(pr.value&&pr.value.type==='Identifier') declLine[pr.value.name]=st.loc.start.line; }
  }
  if(st.type==='FunctionDeclaration'&&st.id) declLine[st.id.name]=st.loc.start.line;
}

// for each const initializer, collect identifiers evaluated IMMEDIATELY (not inside nested function bodies)
function immediateRefs(node, out){
  if(!node||typeof node.type!=='string') return;
  if(node.type==='ArrowFunctionExpression'||node.type==='FunctionExpression'||node.type==='FunctionDeclaration') return; // body not evaluated now
  if(node.type==='Identifier'){ out.push(node); return; }
  for(const k of Object.keys(node)){
    if(k==='loc'||k==='start'||k==='end'||k==='leadingComments'||k==='trailingComments') continue;
    const v=node[k];
    if(Array.isArray(v)) v.forEach(c=>immediateRefs(c,out));
    else if(v&&typeof v.type==='string'){
      // skip non-computed member property names & object keys
      if(node.type==='MemberExpression'&&k==='property'&&!node.computed) continue;
      if(node.type==='ObjectProperty'&&k==='key'&&!node.computed) continue;
      if(node.type==='JSXAttribute'&&k==='name') continue;
      immediateRefs(v,out);
    }
  }
}

const issues=[];
for(const st of stmts){
  let targets=[];
  if(st.type==='VariableDeclaration') targets=st.declarations.filter(d=>d.init).map(d=>d.init);
  else if(st.type==='ExpressionStatement') targets=[st.expression];
  else if(st.type==='ReturnStatement'&&st.argument) targets=[st.argument];
  for(const d of targets){
    const refs=[]; immediateRefs(d,refs);
    for(const r of refs){
      const dl=declLine[r.name];
      if(dl!==undefined && dl>st.loc.start.line){
        issues.push(`line ${st.loc.start.line}: "${r.name}" (declared at ${dl})`);
      }
    }
  }
}
console.log(issues.length? issues.join('\n') : 'No TDZ issues');
