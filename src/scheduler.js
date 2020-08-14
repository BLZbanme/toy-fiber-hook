import { ELEMENT_TEXT, TAG_HOST, TAG_TEXT, TAG_ROOT, TAG_CLASS, PLACEMENT, UPDATE, DELETION, TAG_FUNCTION_COMPONENT } from './constants';
import { setProps } from './utils';
import { UpdateQueue, Update } from './UpdateQueue';

/**
 * 从根节点开始渲染和调度
 * 两个阶段
 * diff阶段 对比新旧的虚拟dom，进行增量更新或创建。render阶段，
 * 这个阶段可能比较花时间，我们对任务进行拆分，拆分的维度虚拟dom。此阶段可以暂停
 * render阶段成果是effect-list，知道哪些节点更新，哪些节点删除了，哪些节点增加了
 * render阶段有两个任务：1.根据虚拟dom生成fiber树 2.收集effect list
 * commit阶段，进行dom更新创建阶段，此阶段不能暂停，要一气呵成
 */

let nextUnitOfWork = null; //下一个工作单元
let workInProgressRoot = null; //RootFiber应用的根
let currentRoot = null; //渲染成功之后当前根数组
let deletions = []; //删除的节点我们并不放在effect list里，所以需要单独记录并执行
let workInProgressFiber =null; //正在工作中的fiber
let hookIndex = 0; //hook索引

export function scheduleRoot(rootFiber) { //{ tag: TAG_ROOT, stateNode: container, props: { children: [element] }}
    if (currentRoot && currentRoot.alternate) { //第二次之后的更新
        workInProgressRoot = currentRoot.alternate; //第一次渲染出来的那个fiber tree
        
        workInProgressRoot.alternate = currentRoot; //让这个树的替身指向当前的currentRoot
        if (rootFiber) {
            workInProgressRoot.props = rootFiber.props; //让他的props更新成新的props
        }
    }
    else if (currentRoot) { //说明至少已经渲染过1次了,第一次更新
        if (rootFiber) {
            rootFiber.alternate = currentRoot;
            workInProgressRoot = rootFiber;    
        }
        else {
            workInProgressRoot = {
                ...currentRoot,
                alternate: currentRoot
            }    
        }
    }
    else { //如果说是第一次渲染
        workInProgressRoot = rootFiber;
    }
    workInProgressRoot.firstEffect = workInProgressRoot.lastEffect = workInProgressRoot.nextEffect = null;
    nextUnitOfWork = workInProgressRoot;
}

function performUnitOfWork(currentFiber) {
    beginWork(currentFiber);
    if (currentFiber.child) {
        return currentFiber.child;
    }

    while (currentFiber) {
        completeUnitOfWork(currentFiber); //没有儿子，让自己完成
        if (currentFiber.sibling) { //看有没有弟弟
            return currentFiber.sibling; //有弟弟返回弟弟
        }
        currentFiber = currentFiber.return; //找父亲，然后让父亲完成
    }
}

//在完成的时候要收集有副作用的fiber，然后组成effect list
function completeUnitOfWork(currentFiber) { //第一个完成的是A1(TEXT)
    let returnFiber = currentFiber.return;
    if (returnFiber) {
        //这一段是把自己儿子的effect链挂到父亲身上
        if (!returnFiber.firstEffect) {
            returnFiber.firstEffect = currentFiber.firstEffect;
        }

        if (currentFiber.lastEffect) {
            if (returnFiber.lastEffect) {
                returnFiber.lastEffect.nextEffect = currentFiber.firstEffect;
            }
            returnFiber.lastEffect = currentFiber.lastEffect;
        }

        //把自己挂到父亲身上
        const effectTag = currentFiber.effectTag;
        if (effectTag) { //自己有副作用 A1 first last=A1(Text);
            //每个fiber有两个属性 firstEffect指向第一个有副作用的子fiber， lastEffect指向最后一个有副作用的子fiber
            //中间的用nextEffect做成一个单链表，firstEffect=大儿子.nextEffect二儿子.nextEffect三儿子
            if (returnFiber.lastEffect) {
                returnFiber.lastEffect.nextEffect = currentFiber;    
            }
            else {
                returnFiber.firstEffect = currentFiber;
            }
            returnFiber.lastEffect = currentFiber;
        }
    }
}

/**
 * beginwork开始收下线的钱
 * completeUnitOfWork把下线的钱收完了
 * 1.创建真实dom元素
 * 2.创建子fiber
 */
function beginWork(currentFiber) { 
    if (currentFiber.tag === TAG_ROOT) { //根fiber
        updateHostRoot(currentFiber);
    }
    else if (currentFiber.tag === TAG_TEXT) { //文本fiber
        updateHostText(currentFiber);
    }
    else if (currentFiber.tag === TAG_HOST) { //原生DOM节点
        updateHost(currentFiber);
    }
    else if (currentFiber.tag === TAG_CLASS) {
        updateClassComponent(currentFiber);
    }
    else if (currentFiber.tag === TAG_FUNCTION_COMPONENT) {
        updateFunctionComponent(currentFiber);
    }
}

function updateFunctionComponent(currentFiber) {
    workInProgressFiber = currentFiber;
    hookIndex = 0;
    workInProgressFiber.hooks = [];
    const newChildren = [currentFiber.type(currentFiber.props)];
    reconcileChildren(currentFiber, newChildren);
}

function updateClassComponent(currentFiber) {
    if (!currentFiber.stateNode) { //类组件 stateNode 组件的实例
        //new ClassCounter(); 类组件实例 fiber双向指向
        currentFiber.stateNode = new currentFiber.type(currentFiber.props);
        currentFiber.stateNode.internalFiber = currentFiber;
        currentFiber.updateQueue = new UpdateQueue();
    }
    //给组件的实例的state赋值
    currentFiber.stateNode.state = currentFiber.updateQueue.forceUpdate(currentFiber.stateNode.state);
    let newElement = currentFiber.stateNode.render();
    const newChildren = [newElement];
    reconcileChildren(currentFiber, newChildren);
}

function updateHost(currentFiber) {
    if (!currentFiber.stateNode) { //如果此fiber没有创建dom节点
        currentFiber.stateNode = createDOM(currentFiber);
    }
    const newChildren = currentFiber.props.children;
    reconcileChildren(currentFiber, newChildren);
}

function createDOM(currentFiber) {
    if (currentFiber.tag === TAG_TEXT) {
        return document.createTextNode(currentFiber.props.text);
    }
    else if (currentFiber.tag === TAG_HOST) { //span div
        let stateNode = document.createElement(currentFiber.type);
        updateDOM(stateNode, {}, currentFiber.props);
        return stateNode;
    }
}

function updateDOM(stateNode, oldProps, newProps) {
    if (stateNode && stateNode.setAttribute) {
        setProps(stateNode, oldProps, newProps);
    } 
}

function updateHostText(currentFiber) {
    if (!currentFiber.stateNode) { //如果此fiber没有创建dom节点
        currentFiber.stateNode = createDOM(currentFiber);
    }
}

function updateHostRoot(currentFiber) {
    //先处理自己 如果是一个原生节点，创建真实dom 2.创建子fiber
    let newChildren = currentFiber.props.children;
    reconcileChildren(currentFiber, newChildren);
}

function reconcileChildren(currentFiber, newChildren) {
    let newChildIndex = 0; //新子节点的索引
    //如果说currentFiber有alternate属性，并且alternate有child属性
    let oldFiber = currentFiber.alternate && currentFiber.alternate.child;
    if (oldFiber) {
        oldFiber.firstEffect = oldFiber.lastEffect = oldFiber.nextEffect = null;
    }
    let prevSibling; //上一个新的子fiber
    //遍历我们的子虚拟dom元素数组，为每个虚拟dom元素创建子Fiber
    while (newChildIndex < newChildren.length || oldFiber) {
        let newChild = newChildren[newChildIndex]; //取出虚拟dom节点[A1]
        let newFiber; //新的Fiber
        const sameType = oldFiber && newChild && oldFiber.type === newChild.type;

        let tag;
        if (newChild && typeof newChild.type === 'function' && newChild.type.prototype.isReactComponent) {
            tag = TAG_CLASS;
        }
        else if (newChild && typeof newChild.type === 'function') {
            tag = TAG_FUNCTION_COMPONENT;
        }
        else if (newChild && newChild.type === ELEMENT_TEXT) {
            tag = TAG_TEXT; //这是一个文本节点
        }
        else if(newChild && typeof newChild.type === 'string') {
            tag = TAG_HOST//如果type是字符串，那么这是一个原生dom节点
        }

        if (sameType) { //说明老fiber和新的虚拟dom类型一样，可以复用老的dom节点，更新即可
            if (oldFiber.alternate) {//说明至少已经更新一次了
                newFiber = oldFiber.alternate; //如果有上上次的fiber，就拿过来作为这一次的fiber
                newFiber.props = newChild.props;
                newFiber.alternate = oldFiber;
                newFiber.effectTag = UPDATE;
                newFiber.updateQueue = oldFiber.updateQueue || new UpdateQueue();
                newFiber.nextEffect = null;
            }
            else {
                newFiber = {
                    tag: oldFiber.tag,//TAG_HOST
                    type: oldFiber.type, //div
                    props: newChild.props, //一定要用新的元素的props
                    stateNode: oldFiber.stateNode, //
                    return: currentFiber,
                    updateQueue : oldFiber.updateQueue || new UpdateQueue(),
                    alternate: oldFiber, //让新的fiber的alternate指向老的fiber节点
                    effectTag: UPDATE, //副作用标识，render阶段我们会收集副作用 增加 删除 更新
                    nextEffect: null, //effect list也是个单链表
                    //effect list顺序和完成顺序是一样的，但是节点只放那些出钱的人的fiber节点，不出钱绕过去
                }
            }
        }
        else {
            if (newChild) { //看看新的虚拟Dom是否为null
                //beginWork的时候创建fiber 在completeUnitOfWork的时候收集effect
                newFiber = {
                    tag,//TAG_HOST
                    type: newChild.type, //div
                    props: newChild.props, //{id='A1' style={style}}
                    stateNode: null, //div还没有创建dom元素
                    return: currentFiber,
                    effectTag: PLACEMENT, //副作用标识，render阶段我们会收集副作用 增加 删除 更新
                    updateQueue : new UpdateQueue(),
                    nextEffect: null, //effect list也是个单链表
                    //effect list顺序和完成顺序是一样的，但是节点只放那些出钱的人的fiber节点，不出钱绕过去
                }
            }
            if (oldFiber) {
                oldFiber.effectTag = DELETION;
                deletions.push(oldFiber);
            }
        }

        if (oldFiber) {
            oldFiber = oldFiber.sibling; //oldFiber指针向后移动一次
        }

        //最小的儿子是没有弟弟的
        if (newFiber) {
            if (newChildIndex === 0) { //如果当前索引为0，说明这是太子
                currentFiber.child = newFiber;
            }
            else {
                prevSibling.sibling = newFiber;//让太子的sibling弟弟指向二皇子
            }
            prevSibling = newFiber;
        }
        newChildIndex++;
    }
}

//循环执行工作 nextUnitWork
function workLoop(deadline) {
    let shouldYield = false; //是否要让出时间片或者说控制权
    while (nextUnitOfWork && !shouldYield) {
        nextUnitOfWork = performUnitOfWork(nextUnitOfWork); //执行完一个任务后
        shouldYield = deadline.timeRemaining() < 1; //没有时间的话就要让出控制权
    }

    if (!nextUnitOfWork && workInProgressRoot) { //如果时间片到期后还有任务没完成，就需要请求浏览器再次调度
        commitRoot();
    }

    //不管用没有任务，都请求再次调度，每一帧都要执行一次workLoop
    requestIdleCallback(workLoop, { timeout: 500 })
}

function commitRoot() {

    deletions.forEach(commitWork); //执行effect list前先把该删除的任务删除
    let currentFiber = workInProgressRoot.firstEffect;
    while (currentFiber) {
        commitWork(currentFiber);
        currentFiber = currentFiber.nextEffect;
    }
    deletions.length = 0; //提交之后清空deletion数组
    currentRoot = workInProgressRoot; //当前渲染的成功的根fiber 赋给currentRoot
    workInProgressRoot = null;
}

function commitWork(currentFiber) {
    if (!currentFiber) return;
    let returnFiber = currentFiber.return;
    while (returnFiber.tag !== TAG_HOST && returnFiber.tag !== TAG_ROOT && returnFiber.tag !== TAG_TEXT) {
        returnFiber = returnFiber.return;
    }
    let domReturn = returnFiber.stateNode;
    if (currentFiber.effectTag === PLACEMENT) { //新增节点
        let nextFiber = currentFiber;
        if (nextFiber.tag === TAG_CLASS) {
            return;
        }
        //如果要挂载的节点不是dom节点，不如说是类组件Fiber，一直找第一个儿子，直到找到一个真实dom节点为止
        
        while (nextFiber && nextFiber.tag !== TAG_HOST && nextFiber.tag !== TAG_TEXT) {
            nextFiber = currentFiber.child;
        }
        domReturn.appendChild(nextFiber.stateNode);
    }
    else if (currentFiber.effectTag === DELETION) {
        commitDeletion(currentFiber, domReturn);
        return;
        // domReturn.removeChild(currentFiber.stateNode);
        
    }
    else if (currentFiber.effectTag === UPDATE) {
        if (currentFiber.type === ELEMENT_TEXT) {
            if (currentFiber.alternate.props.text !== currentFiber.props.text) {
                currentFiber.stateNode.textContent = currentFiber.props.text;
            }
        }
        else {
            
            updateDOM(currentFiber.stateNode, currentFiber.alternate.props, currentFiber.props);
        }
    }
    currentFiber.effectTag = null;
}

function commitDeletion(currentFiber, domReturn) {
    if (currentFiber.tag === TAG_HOST || currentFiber.tag === TAG_TEXT) {
        domReturn.removeChild(currentFiber.stateNode);
    }
    else {
        commitDeletion(currentFiber.child, domReturn);
    }
}

/**
 * 
 * @param {*} reducer 
 * @param {*} initialValue 
 */
export function useReducer(reducer, initialValue) {
    let newHook = workInProgressFiber.alternate && workInProgressFiber.alternate.hooks
       && workInProgressFiber.alternate.hooks[hookIndex];
    if (newHook) {
        //第二次渲染 TODO
        newHook.state = newHook.updateQueue.forceUpdate(newHook.state);
    }
    else {
        newHook = {
            state: initialValue,
            updateQueue: new UpdateQueue()
        }
    }

    // const dispatch = null;
    const dispatch = action => {
        let payload = reducer ? reducer(newHook.state, action) : action;
        newHook.updateQueue.enqueueUpdate(
            new Update(payload)
        );
        scheduleRoot();
    }

    workInProgressFiber.hooks[hookIndex] = newHook;
    return [newHook.state, dispatch];
}

//react 告诉浏览器，我现在有任务，请你在闲的时候
requestIdleCallback(workLoop, { timeout: 500 });