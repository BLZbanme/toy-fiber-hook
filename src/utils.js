export function setProps(dom, oldProps, newProps) {
    for (let key in oldProps) {
        if (key !== 'child') {
            if (newProps.hasOwnProperty(key)) {
                setProp(dom, key, newProps[key]); //新老都有，则更新
            }
            else {
                dom.removeAttribute(key); //老props里有此属性，新没有，则删除
            }
        }
    }

    for (let key in newProps) {
        if (key !== 'child') {
            if (!oldProps.hasOwnProperty(key)) { //老的没有，新的有，添加子属性
                setProp(dom, key, newProps[key])
            }
        }
    }
}

function setProp(dom, key, value) {
    if (/^on/.test(key)) { //onClick
        dom[key.toLowerCase()] = value; //没有用合成事件
    }
    else if (key === 'style') {
        if (value) {
            for (let styleName in value) {
                dom.style[styleName] = value[styleName];
            }
        }
    }
    else {
        dom.setAttribute(key, value);
    }
}