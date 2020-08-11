/**
 * 从根节点开始渲染和调度
 * 两个阶段
 * diff阶段 对比新旧的虚拟dom，进行增量更新或创建。render阶段，
 * 这个阶段可能比较花时间，我们对任务进行拆分，拆分的维度虚拟dom。此阶段可以暂停
 * commit阶段，进行dom更新创建阶段，此阶段不能暂停，要一气呵成
 */

let nextUnitOfWork = null; //下一个工作单元
let workInProgressRoot = null; //RootFiber应用的根
function scheduleRoot(rootFiber) { //{ tag: TAG_ROOT, stateNode: container, props: { children: [element] }}
    workInProgressRoot = rootFiber;
    nextUnitOfWork = rootFiber;
}

function performUnitOfWork() {
    
}

//循环执行工作 nextUnitWork
function workLoop(deadline) {
    let shouldYield = false; //是否要让出时间片或者说控制权
    while (nextUnitOfWork && !shouldYield) {
        nextUnitOfWork = performUnitOfWork(nextUnitOfWork); //执行完一个任务后
        shouldYield = deadline.timeRemaining() < 1; //没有时间的话就要让出控制权
    }

    if (!nextUnitOfWork) { //如果时间片到期后还有任务没完成，就需要请求浏览器再次调度
        console.log('render阶段结束');
    }

    //不管用没有任务，都请求再次调度，每一帧都要执行一次workLoop
    requestIdleCallback(workLoop, { timeout: 500 })
}

//react 告诉浏览器，我现在有任务，请你在闲的时候
requestIdleCallback(workLoop, { timeout: 500 });