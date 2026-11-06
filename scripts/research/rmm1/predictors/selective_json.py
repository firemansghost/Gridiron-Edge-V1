"""Strict JSON syntax with field-selective semantic decoding; no file/network I/O."""
import json
import re

class ProjectionStop(ValueError):
    pass

def scalar():return {'kind':'scalar'}
def array(items):return {'kind':'array','items':items}
def obj(fields,nullable=False):return {'kind':'object','fields':fields,'nullable':nullable}

NUMBER=re.compile(r'-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?')

class Projector:
    def __init__(self,body,max_depth=64,max_nodes=5000000):
        if type(body) is not bytes:raise ProjectionStop('BYTES_REQUIRED')
        try:self.text=body.decode('utf-8')
        except UnicodeDecodeError:raise ProjectionStop('UTF8_REQUIRED') from None
        self.i=0;self.max_depth=max_depth;self.max_nodes=max_nodes
        self.nodes=0;self.selected=0;self.skipped=0;self.projected_paths={}

    def fail(self,code):raise ProjectionStop(code)
    def whitespace(self):
        while self.i<len(self.text) and self.text[self.i] in ' \t\n\r':self.i+=1

    def string(self,decode):
        start=self.i
        if self.i>=len(self.text) or self.text[self.i]!='"':self.fail('STRING_REQUIRED')
        self.i+=1
        while self.i<len(self.text):
            char=self.text[self.i]
            if char=='"':
                self.i+=1
                if decode:
                    try:return json.loads(self.text[start:self.i])
                    except (ValueError,RecursionError):self.fail('STRING_SYNTAX_INVALID')
                return None
            if ord(char)<32:self.fail('STRING_CONTROL_CHARACTER')
            if char=='\\':
                self.i+=1
                if self.i>=len(self.text):self.fail('STRING_ESCAPE_INVALID')
                esc=self.text[self.i]
                if esc=='u':
                    digits=self.text[self.i+1:self.i+5]
                    if len(digits)!=4 or any(c not in '0123456789abcdefABCDEF' for c in digits):self.fail('STRING_UNICODE_ESCAPE_INVALID')
                    self.i+=4
                elif esc not in '"\\/bfnrt':self.fail('STRING_ESCAPE_INVALID')
            self.i+=1
        self.fail('STRING_UNTERMINATED')

    def value(self,spec,path,depth):
        self.nodes+=1
        if depth>self.max_depth or self.nodes>self.max_nodes:self.fail('JSON_COMPLEXITY_LIMIT')
        self.whitespace()
        if self.i>=len(self.text):self.fail('UNEXPECTED_END')
        kind=spec['kind'] if spec is not None else None
        char=self.text[self.i]
        if char=='{':
            if spec is not None and kind!='object':self.fail('PROJECTED_TYPE_MISMATCH')
            fields=spec['fields'] if spec else {};result={} if spec else None;seen=set();self.i+=1;self.whitespace()
            if self.i<len(self.text) and self.text[self.i]=='}':self.i+=1
            else:
                while True:
                    self.whitespace();key=self.string(True)
                    if key in seen:self.fail('DUPLICATE_JSON_KEY')
                    seen.add(key);self.whitespace()
                    if self.i>=len(self.text) or self.text[self.i]!=':':self.fail('OBJECT_COLON_REQUIRED')
                    self.i+=1
                    selected=key in fields
                    child=self.value(fields[key] if selected else None,path+'.'+key,depth+1)
                    if selected:result[key]=child
                    self.whitespace()
                    if self.i>=len(self.text):self.fail('OBJECT_UNTERMINATED')
                    char=self.text[self.i];self.i+=1
                    if char=='}':break
                    if char!=',':self.fail('OBJECT_SEPARATOR_INVALID')
            if spec and set(result)!=set(fields):self.fail('PROJECTED_FIELD_MISSING')
            return result
        if char=='[':
            if spec is not None and kind!='array':self.fail('PROJECTED_TYPE_MISMATCH')
            result=[] if spec else None;self.i+=1;self.whitespace()
            if self.i<len(self.text) and self.text[self.i]==']':self.i+=1
            else:
                while True:
                    child=self.value(spec['items'] if spec else None,path+'[]',depth+1)
                    if spec:result.append(child)
                    self.whitespace()
                    if self.i>=len(self.text):self.fail('ARRAY_UNTERMINATED')
                    char=self.text[self.i];self.i+=1
                    if char==']':break
                    if char!=',':self.fail('ARRAY_SEPARATOR_INVALID')
            return result
        if kind not in (None,'scalar'):
            if char=='n' and self.text.startswith('null',self.i) and kind=='object' and spec.get('nullable'):
                self.i+=4;self.selected+=1;self.projected_paths[path]=self.projected_paths.get(path,0)+1;return None
            self.fail('PROJECTED_TYPE_MISMATCH')
        materialize=spec is not None
        if char=='"':result=self.string(materialize)
        elif self.text.startswith('true',self.i):self.i+=4;result=True if materialize else None
        elif self.text.startswith('false',self.i):self.i+=5;result=False if materialize else None
        elif self.text.startswith('null',self.i):self.i+=4;result=None
        else:
            match=NUMBER.match(self.text,self.i)
            if not match:self.fail('JSON_SCALAR_SYNTAX_INVALID')
            self.i=match.end()
            if materialize:
                token=match.group()
                if len(token)>1024:self.fail('SELECTED_NUMBER_LIMIT')
                try:result=float(token) if any(c in token for c in '.eE') else int(token)
                except (ValueError,OverflowError):self.fail('SELECTED_NUMBER_INVALID')
            else:result=None
        if materialize:
            self.selected+=1;self.projected_paths[path]=self.projected_paths.get(path,0)+1
        else:self.skipped+=1
        return result

    def project(self,spec):
        result=self.value(spec,'$',0);self.whitespace()
        if self.i!=len(self.text):self.fail('JSON_TRAILING_CONTENT')
        return result,{'selectedScalars':self.selected,'skippedScalarsNotMaterialized':self.skipped,'nodesSyntaxChecked':self.nodes,'selectedPathPatterns':dict(sorted(self.projected_paths.items()))}

def project_bytes(body,spec):return Projector(body).project(spec)
