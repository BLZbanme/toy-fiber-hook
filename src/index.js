import React from './react';
import ReactDOM from './react-dom';

//JSX其实是一种特殊语法，在webpack打包的时候，babel编译的时候会编译成js
let style = {
	border: '3px solid red',
	margin: '5px'
}
let element = (
	<div id='A1' style={style}>
		A1
		<div id='B1' style={style}>
			B1
			<div id='C1' style={style}>C1</div>
			<div id='C2' style={style}>C2</div>
		</div>
		<div id='B2' style={style}>B2</div>
	</div>
)

console.log(element);
ReactDOM.render(
	element,
	document.getElementById('root')
);
