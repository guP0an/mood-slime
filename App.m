#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#import <sys/file.h>
#import <fcntl.h>
#import <unistd.h>
#import "Store.h"
#import "DesktopMotion.h"
#import "CodexAlerts.h"

@interface PetWindow : NSPanel @end
@implementation PetWindow
- (BOOL)canBecomeKeyWindow {return YES;}
- (BOOL)canBecomeMainWindow {return (self.styleMask&NSWindowStyleMaskNonactivatingPanel)==0;}
@end
@interface MoodMessageButton : NSButton
@property NSDictionary *messageEvent;
@end
@implementation MoodMessageButton @end
@interface MoodMessageList : NSView @end
@implementation MoodMessageList
- (BOOL)isFlipped {return YES;}
@end
@interface MoodApp : NSObject <NSApplicationDelegate,WKScriptMessageHandler,WKNavigationDelegate,NSWindowDelegate,NSPopoverDelegate>
@property PetWindow *window;
@property PetWindow *calendarWindow;
@property WKWebView *web;
@property id inputMonitor;
@property BOOL pendingMove;
@property BOOL following,dragging,menuOpen,gazePending;
@property NSTimer *pointerTimer;
@property NSTimeInterval followResumeAt,lastPointerTick;
@property NSPoint lastGaze;
@property NSRect lastMotionFrame;
@property BOOL rollPending;
@property NSPoint queuedRoll;
@property NSPoint dragMouseStart;
@property NSRect dragFrameStart;
@property BOOL directMove;
@property CGFloat desktopScale;
@property CodexAlerts *codexAlerts;
@property NSButton *codexButton;
@property NSString *petTintHex;
@property NSColor *messageBaseColor;
@property NSPopover *messagePopover;
@property NSTimer *alertTimer;
@property BOOL alertPolling;
@property id displayObserver,spaceObserver;
@property NSString *displayID;
@property NSStatusItem *statusItem;
@property MoodStore *store;
@property dispatch_queue_t io;
@property BOOL testing,testStarted,finished,desktop,terminating;
@property BOOL transparencyAvailable;
@property BOOL failNextSave;
@property NSUInteger pendingIO;
@property int lockFD;
@property NSRect expandedFrame;
@property NSURL *testRoot,*artifacts;
@end

@implementation MoodApp
- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    self.lockFD=-1;self.testing=[NSProcessInfo.processInfo.arguments containsObject:@"--self-test"];
    self.desktopScale=.5;
    NSArray *args=NSProcessInfo.processInfo.arguments;NSUInteger ai=[args indexOfObject:@"--artifacts"];
    if(self.testing&&ai!=NSNotFound&&ai+1<args.count)self.artifacts=[NSURL fileURLWithPath:args[ai+1] isDirectory:YES];
    NSURL *root=[[NSFileManager.defaultManager homeDirectoryForCurrentUser] URLByAppendingPathComponent:@"Library/Application Support/MoodSlime" isDirectory:YES];
    if(self.testing){root=[NSURL fileURLWithPath:[NSTemporaryDirectory() stringByAppendingPathComponent:[@"mood-slime-ui-" stringByAppendingString:NSUUID.UUID.UUIDString]] isDirectory:YES];self.testRoot=root;}
    NSError *error=nil;
    if(![NSFileManager.defaultManager createDirectoryAtURL:root withIntermediateDirectories:YES attributes:@{NSFilePosixPermissions:@0700} error:&error]){[self fatal:@"无法创建本机存档目录。" error:error];return;}
    self.lockFD=open([[root URLByAppendingPathComponent:@"app.lock"].path fileSystemRepresentation],O_CREAT|O_RDWR,0600);
    if(self.lockFD<0||flock(self.lockFD,LOCK_EX|LOCK_NB)!=0){[self fatal:@"心晴已经打开，请使用程序坞中的窗口。" error:nil];return;}
    self.io=dispatch_queue_create("local.silovere.moodslime.storage",DISPATCH_QUEUE_SERIAL);
    self.store=[[MoodStore alloc] initWithRoot:root];[self.store load];
    self.codexAlerts=[[CodexAlerts alloc] initWithRoot:[root URLByAppendingPathComponent:@"CodexInbox" isDirectory:YES]];
    if(self.testing)[self seedSyntheticHistory];
    [self createMenu];
    self.statusItem=[NSStatusBar.systemStatusBar statusItemWithLength:NSVariableStatusItemLength];self.statusItem.button.title=@"晴";
    NSMenu *statusMenu=[NSMenu new];
    [statusMenu addItem:[self menuItem:@"找回小球（默认大小）" command:@"recover"]];
    [statusMenu addItem:[self menuItem:@"打开心情日历" command:@"calendar"]];
    [statusMenu addItem:[self menuItem:@"Codex 消息" command:@"codexMessages"]];
    [statusMenu addItem:[self menuItem:@"退出心晴" command:@"quit"]];self.statusItem.menu=statusMenu;
    WKWebViewConfiguration *configuration=[WKWebViewConfiguration new];configuration.websiteDataStore=WKWebsiteDataStore.nonPersistentDataStore;
    [configuration.userContentController addScriptMessageHandler:self name:@"mood"];
    NSMutableDictionary *boot=[@{@"state":self.store.state,@"readOnly":@(self.store.readOnly),@"testing":@(self.testing)} mutableCopy];
    if(self.store.warning)boot[@"warning"]=self.store.warning;NSString *skin=[self.store skinSource];if(skin)boot[@"skinSource"]=skin;
    NSData *data=[NSJSONSerialization dataWithJSONObject:boot options:0 error:NULL];NSString *json=[[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    [configuration.userContentController addUserScript:[[WKUserScript alloc] initWithSource:[@"window.__moodBoot=" stringByAppendingString:json] injectionTime:WKUserScriptInjectionTimeAtDocumentStart forMainFrameOnly:YES]];
    self.web=[[WKWebView alloc] initWithFrame:NSMakeRect(0,0,1040,810) configuration:configuration];self.web.navigationDelegate=self;
    self.web.underPageBackgroundColor=NSColor.clearColor;
    // shortcut: WebKit has no public drawsBackground switch; revalidate on each supported macOS before distribution.
    @try {[self.web setValue:@NO forKey:@"drawsBackground"];self.transparencyAvailable=YES;}
    @catch(NSException *exception){self.transparencyAvailable=NO;}
    NSWindowStyleMask initialStyle=self.testing?NSWindowStyleMaskBorderless|NSWindowStyleMaskNonactivatingPanel:NSWindowStyleMaskTitled|NSWindowStyleMaskClosable|NSWindowStyleMaskMiniaturizable|NSWindowStyleMaskResizable;
    self.window=[[PetWindow alloc] initWithContentRect:NSMakeRect(0,0,1040,810) styleMask:initialStyle backing:NSBackingStoreBuffered defer:NO];
    self.window.title=@"心晴 · 心情日历";self.window.backgroundColor=[NSColor colorWithCalibratedRed:.973 green:.969 blue:.949 alpha:1];
    self.window.contentMinSize=NSMakeSize(790,720);self.window.releasedWhenClosed=NO;self.window.delegate=self;self.window.contentView=self.web;[self.window center];
    self.window.hidesOnDeactivate=NO;
    self.window.collectionBehavior=NSWindowCollectionBehaviorMoveToActiveSpace|NSWindowCollectionBehaviorFullScreenAuxiliary|NSWindowCollectionBehaviorCanJoinAllApplications;
    self.codexButton=[NSButton buttonWithTitle:@"" target:self action:@selector(showCodexMessages:)];
    self.codexButton.bezelStyle=NSBezelStyleRounded;self.codexButton.font=[NSFont systemFontOfSize:12 weight:NSFontWeightSemibold];
    self.codexButton.appearance=[NSAppearance appearanceNamed:NSAppearanceNameAqua];
    self.codexButton.bordered=NO;self.codexButton.wantsLayer=YES;
    self.codexButton.layer.cornerRadius=18;self.codexButton.layer.borderWidth=.5;
    [self applyPetTint:@"#79B994"];
    self.codexButton.hidden=YES;self.codexButton.translatesAutoresizingMaskIntoConstraints=NO;[self.web addSubview:self.codexButton];
    [NSLayoutConstraint activateConstraints:@[[self.codexButton.topAnchor constraintEqualToAnchor:self.web.topAnchor constant:0],[self.codexButton.trailingAnchor constraintEqualToAnchor:self.web.trailingAnchor constant:-8],[self.codexButton.heightAnchor constraintEqualToConstant:36],[self.codexButton.widthAnchor constraintEqualToConstant:154]]];
    if(self.testing){self.window.level=NSStatusWindowLevel;self.window.floatingPanel=YES;self.window.collectionBehavior=NSWindowCollectionBehaviorCanJoinAllSpaces|NSWindowCollectionBehaviorFullScreenAuxiliary|NSWindowCollectionBehaviorCanJoinAllApplications;}
    [self.window makeKeyAndOrderFront:nil];[NSApp activateIgnoringOtherApps:YES];
    __weak MoodApp *weakSelf=self;
    self.inputMonitor=[NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskLeftMouseDown|NSEventMaskLeftMouseDragged|NSEventMaskLeftMouseUp|NSEventMaskKeyDown|NSEventMaskScrollWheel|NSEventMaskMagnify handler:^NSEvent *(NSEvent *event){
        MoodApp *owner=weakSelf;
        if(owner.dragging&&[owner handleDesktopDragEvent:event])return nil;
        if(!owner||event.window!=owner.window||!owner.desktop)return event;
        NSPoint click=[owner.codexButton convertPoint:event.locationInWindow fromView:nil];
        if(!owner.codexButton.hidden&&NSPointInRect(click,owner.codexButton.bounds))return event;
        if(event.type==NSEventTypeMagnify){[owner resizeDesktopTo:owner.desktopScale*(1+MAX(-.2,MIN(.2,event.magnification)))];return nil;}
        if(event.type==NSEventTypeScrollWheel){
            if(!owner.menuOpen&&!owner.dragging){CGFloat delta=MAX(-.2,MIN(.2,event.scrollingDeltaY*(event.hasPreciseScrollingDeltas?.004:.035)));[owner resizeDesktopTo:owner.desktopScale*exp(delta)];}
            return nil;
        }
        if(event.type==NSEventTypeKeyDown&&event.keyCode==53){owner.pendingMove=NO;owner.following=NO;return event;}
        if(event.type==NSEventTypeLeftMouseDown&&MoodShouldDrag(owner.pendingMove,event.modifierFlags)){
            [owner handleDesktopDragEvent:event];
            return nil;
        }
        return event;
    }];
    if(!self.testing){
        self.pointerTimer=[NSTimer scheduledTimerWithTimeInterval:.05 repeats:YES block:^(NSTimer *timer){[weakSelf updateDesktopPointer];}];
        self.pointerTimer.tolerance=.015;
        self.alertTimer=[NSTimer scheduledTimerWithTimeInterval:1 repeats:YES block:^(NSTimer *timer){[weakSelf checkCodexMessages];}];self.alertTimer.tolerance=.2;
    }
    self.displayObserver=[NSNotificationCenter.defaultCenter addObserverForName:NSApplicationDidChangeScreenParametersNotification object:nil queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *note){[weakSelf keepOnPointerScreen];}];
    self.spaceObserver=[NSWorkspace.sharedWorkspace.notificationCenter addObserverForName:NSWorkspaceActiveSpaceDidChangeNotification object:nil queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *note){
        [weakSelf refreshOverlayAfterSpaceChange];
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW,NSEC_PER_SEC/3),dispatch_get_main_queue(),^{[weakSelf refreshOverlayAfterSpaceChange];});
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW,NSEC_PER_SEC),dispatch_get_main_queue(),^{[weakSelf refreshOverlayAfterSpaceChange];});
    }];
    NSURL *web=[NSBundle.mainBundle.resourceURL URLByAppendingPathComponent:@"web"];
    [self.web loadFileURL:[web URLByAppendingPathComponent:@"index.html"] allowingReadAccessToURL:web];
    if(self.testing)dispatch_after(dispatch_time(DISPATCH_TIME_NOW,65*NSEC_PER_SEC),dispatch_get_main_queue(),^{if(!self.finished)[self finish:@"WebKit 集成自检超时"];});
}
- (void)createMenu {
    NSMenu *menu=[NSMenu new],*app=[NSMenu new],*edit=[NSMenu new];NSMenuItem *a=[NSMenuItem new],*e=[NSMenuItem new];
    [app addItemWithTitle:@"退出心晴" action:@selector(terminate:) keyEquivalent:@"q"];a.submenu=app;[menu addItem:a];
    for(NSArray *entry in @[@[@"撤销",@"undo:",@"z"],@[@"剪切",@"cut:",@"x"],@[@"复制",@"copy:",@"c"],@[@"粘贴",@"paste:",@"v"],@[@"全选",@"selectAll:",@"a"]])[edit addItemWithTitle:entry[0] action:NSSelectorFromString(entry[1]) keyEquivalent:entry[2]];
    e.submenu=edit;[menu addItem:e];NSApp.mainMenu=menu;
}
- (void)fatal:(NSString *)message error:(NSError *)error {
    if(self.testing){[self finish:message];return;}
    NSAlert *alert=[NSAlert new];alert.messageText=message;alert.informativeText=error.localizedDescription?:@"";[alert runModal];[NSApp terminate:nil];
}
- (void)reply:(NSNumber *)identifier value:(NSDictionary *)value {
    [self.web callAsyncJavaScript:@"window.nativeReply(id, value)" arguments:@{@"id":identifier,@"value":value} inFrame:nil inContentWorld:WKContentWorld.pageWorld completionHandler:nil];
}
- (void)ioFinished {
    self.pendingIO--;if(self.terminating&&self.pendingIO==0)[NSApp replyToApplicationShouldTerminate:YES];
}
- (void)userContentController:(WKUserContentController *)controller didReceiveScriptMessage:(WKScriptMessage *)message {
    NSURL *index=[[NSBundle.mainBundle.resourceURL URLByAppendingPathComponent:@"web"] URLByAppendingPathComponent:@"index.html"];
    if(!message.frameInfo.isMainFrame||!message.frameInfo.request.URL.isFileURL||![message.frameInfo.request.URL.standardizedURL.path isEqual:index.standardizedURL.path]||![message.body isKindOfClass:NSDictionary.class])return;
    NSDictionary *body=message.body;NSNumber *identifier=body[@"id"];NSString *action=body[@"action"];
    if(![identifier isKindOfClass:NSNumber.class]||![action isKindOfClass:NSString.class])return;
    if([action isEqual:@"petTint"]){[self applyPetTint:body[@"color"]];return;}
    if([action isEqual:@"save"]) {
        if(self.testing&&self.failNextSave){self.failNextSave=NO;[self reply:identifier value:@{@"ok":@NO,@"error":@"合成测试：磁盘写入失败，原记录已保留。"}];return;}
        NSDictionary *state=body[@"data"];if(![state isKindOfClass:NSDictionary.class]){[self reply:identifier value:@{@"ok":@NO,@"error":@"记录格式无效。"}];return;}
        self.pendingIO++;dispatch_async(self.io,^{NSError *error=nil;BOOL ok=[self.store save:state error:&error];dispatch_async(dispatch_get_main_queue(),^{[self reply:identifier value:ok?@{@"ok":@YES}:@{@"ok":@NO,@"error":error.localizedDescription?:@"无法保存。"}];[self ioFinished];});});return;
    }
    if([action isEqual:@"desktop"]) {if(![body[@"enabled"] isKindOfClass:NSNumber.class])return;if([body[@"enabled"] boolValue]&&!self.transparencyAvailable){[self reply:identifier value:@{@"ok":@NO,@"error":@"当前系统的 WebKit 不支持透明桌面窗口，日历功能仍可使用。"}];return;}[self applyDesktop:[body[@"enabled"] boolValue]];[self reply:identifier value:@{@"ok":@YES}];return;}
    if([action isEqual:@"contextMenu"]){
        id x=body[@"x"],y=body[@"y"];
        if(!self.desktop||![x isKindOfClass:NSNumber.class]||![y isKindOfClass:NSNumber.class]||!isfinite([x doubleValue])||!isfinite([y doubleValue])||[x doubleValue]<0||[y doubleValue]<0||[x doubleValue]>self.web.bounds.size.width||[y doubleValue]>self.web.bounds.size.height){[self reply:identifier value:@{@"ok":@NO,@"error":@"菜单位置无效。"}];return;}
        [self reply:identifier value:@{@"ok":@YES}];
        NSPoint point=NSMakePoint([x doubleValue],self.web.isFlipped?[y doubleValue]:self.web.bounds.size.height-[y doubleValue]);
        self.menuOpen=YES;
        @try {[[self desktopMenu] popUpMenuPositioningItem:nil atLocation:point inView:self.web];}
        @finally {self.menuOpen=NO;self.followResumeAt=NSProcessInfo.processInfo.systemUptime+.8;}
        return;
    }
    if([action isEqual:@"notifyError"]){
        NSString *text=body[@"message"];
        if([text isKindOfClass:NSString.class]&&text.length<1000&&!self.testing){NSAlert *alert=[NSAlert new];alert.messageText=@"这次操作没有完成";alert.informativeText=text;[alert beginSheetModalForWindow:self.window completionHandler:nil];}
        [self reply:identifier value:@{@"ok":@YES}];return;
    }
    if(self.testing&&[action isEqual:@"testShowWindow"]){
        self.window.collectionBehavior=NSWindowCollectionBehaviorCanJoinAllSpaces|NSWindowCollectionBehaviorFullScreenAuxiliary|NSWindowCollectionBehaviorCanJoinAllApplications;
        self.window.level=NSStatusWindowLevel;[NSApp unhide:nil];[self.window center];[self.window makeKeyAndOrderFront:nil];[self.window orderFrontRegardless];[NSApp activateIgnoringOtherApps:YES];
        [self reply:identifier value:@{@"ok":@YES,@"visible":@(self.window.visible),@"occluded":@(!(self.window.occlusionState&NSWindowOcclusionStateVisible)),@"appHidden":@(NSApp.hidden)}];return;
    }
    if(self.testing&&[action isEqual:@"testMenuInfo"]){[self reply:identifier value:@{@"ok":@YES,@"items":[self describeMenu:[self desktopMenu]],@"scale":@(self.desktopScale),@"width":@(self.web.bounds.size.width),@"height":@(self.web.bounds.size.height),@"onScreen":@(NSContainsRect((self.window.screen?:NSScreen.mainScreen).visibleFrame,self.window.frame)),@"following":@(self.following),@"dragging":@(self.dragging),@"moving":@(self.pendingMove),@"visible":@(self.window.visible),@"occluded":@(!(self.window.occlusionState&NSWindowOcclusionStateVisible)),@"appHidden":@(NSApp.hidden),@"active":@(NSApp.active),@"webHasWindow":@(self.web.window!=nil),@"webHidden":@(self.web.hiddenOrHasHiddenAncestor),@"webFrame":NSStringFromRect(self.web.frame),@"visibleRect":NSStringFromRect(self.web.visibleRect)}];return;}
    if(self.testing&&[action isEqual:@"testDesktopMotion"]){
        NSRect visible=(self.window.screen?:NSScreen.mainScreen).visibleFrame,frame=self.window.frame;
        NSPoint cursor=NSMakePoint(NSMinX(visible)+50,NSMidY(visible));
        NSPoint next=MoodFollowOrigin(frame,visible,cursor,.05,NO);
        BOOL moved=!NSEqualPoints(next,frame.origin);
        if(MoodShouldFollow(self.following,self.desktop,self.window.visible,NO,0))[self.window setFrameOrigin:next];
        [self reply:identifier value:@{@"ok":@YES,@"moved":@(moved&&!NSEqualPoints(self.window.frame.origin,frame.origin)),@"defaultSqueezes":@(!MoodShouldDrag(NO,0)),@"optionDrags":@(MoodShouldDrag(NO,NSEventModifierFlagOption)),@"controlOpensMenu":@(!MoodShouldDrag(NO,NSEventModifierFlagControl)),@"buttonsPause":@(!MoodShouldFollow(YES,YES,YES,NO,1)),@"dragPauses":@(!MoodShouldFollow(YES,YES,YES,YES,0)),@"calendarPauses":@(!MoodShouldFollow(YES,NO,YES,NO,0))}];return;
    }
    if(self.testing&&[action isEqual:@"testRollingMove"]){
        NSRect old=self.window.frame;NSPoint start=NSMakePoint(old.size.width/2,old.size.height/2);
        NSEvent *down=[NSEvent mouseEventWithType:NSEventTypeLeftMouseDown location:start modifierFlags:NSEventModifierFlagOption timestamp:0 windowNumber:self.window.windowNumber context:nil eventNumber:1 clickCount:1 pressure:1];
        NSEvent *drag=[NSEvent mouseEventWithType:NSEventTypeLeftMouseDragged location:NSMakePoint(start.x+30,start.y) modifierFlags:NSEventModifierFlagOption timestamp:.1 windowNumber:self.window.windowNumber context:nil eventNumber:2 clickCount:1 pressure:1];
        BOOL begin=[self handleDesktopDragEvent:down],move=[self handleDesktopDragEvent:drag];
        [self reply:identifier value:@{@"ok":@(begin&&move&&self.dragging&&fabs(self.window.frame.origin.x-old.origin.x-30)<1)}];return;
    }
    if(self.testing&&[action isEqual:@"testRollingEnd"]){
        NSEvent *up=[NSEvent mouseEventWithType:NSEventTypeLeftMouseUp location:NSZeroPoint modifierFlags:0 timestamp:.2 windowNumber:self.window.windowNumber context:nil eventNumber:3 clickCount:1 pressure:0];
        BOOL ended=[self handleDesktopDragEvent:up];[self reply:identifier value:@{@"ok":@(ended&&!self.dragging)}];return;
    }
    if(self.testing&&[action isEqual:@"testCodexAlert"]){
        NSString *kind=[@[@"completed",@"approval",@"question"] containsObject:body[@"kind"]]?body[@"kind"]:@"approval";
        NSString *seed=!body[@"kind"]?@"a":[kind isEqual:@"completed"]?@"c":[kind isEqual:@"question"]?@"b":@"d";
        NSDictionary *event=@{@"version":@1,@"id":[@"" stringByPaddingToLength:64 withString:seed startingAtIndex:0],@"thread":@"00000000-0000-4000-8000-000000000000",@"kind":kind,@"title":@"设计桌面心情日历",@"at":@(NSDate.date.timeIntervalSince1970)};
        [self.codexAlerts accept:event];[self refreshCodexButton];
        BOOL shown=!self.codexButton.hidden&&self.codexButton.title.length>0;
        BOOL url=[CodexAlerts chatURL:event]!=nil;
        [self.web layoutSubtreeIfNeeded];
        NSSize textSize=self.codexButton.attributedTitle.size;
        [self reply:identifier value:@{@"ok":@YES,@"badgeVisible":@(shown),@"badgeTitle":self.codexButton.title,@"petTint":self.petTintHex?:@"",@"fitsWindow":@(NSContainsRect(self.web.bounds,self.codexButton.frame)),@"horizontalPadding":@((self.codexButton.bounds.size.width-textSize.width)/2),@"verticalPadding":@((self.codexButton.bounds.size.height-textSize.height)/2),@"safeChatURL":@(url),@"allSpaces":@((self.window.collectionBehavior&NSWindowCollectionBehaviorCanJoinAllSpaces)!=0),@"allApps":@((self.window.collectionBehavior&NSWindowCollectionBehaviorCanJoinAllApplications)!=0),@"fullScreen":@((self.window.collectionBehavior&NSWindowCollectionBehaviorFullScreenAuxiliary)!=0),@"topmost":@(self.window.level==NSStatusWindowLevel),@"nonactivating":@((self.window.styleMask&NSWindowStyleMaskNonactivatingPanel)!=0),@"displayCount":@(NSScreen.screens.count)}];return;
    }
    if(self.testing&&[action isEqual:@"testCodexPaper"]){
        if([body[@"close"] boolValue])[self.messagePopover performClose:nil];else [self showCodexMessages:nil];
        NSMutableArray *labels=[NSMutableArray new];BOOL fits=YES;
        for(NSView *view in self.messagePopover.contentViewController.view.subviews)if([view isKindOfClass:NSScrollView.class]){
            for(NSView *row in [(NSScrollView *)view documentView].subviews)if([row isKindOfClass:MoodMessageButton.class]){
                NSAttributedString *text=[(MoodMessageButton *)row attributedTitle];[labels addObject:text.string];
                NSRect bounds=[text boundingRectWithSize:NSMakeSize(row.bounds.size.width-12,1000) options:NSStringDrawingUsesLineFragmentOrigin|NSStringDrawingUsesFontLeading];
                fits=fits&&bounds.size.height<=row.bounds.size.height-8;
            }
        }
        [self reply:identifier value:@{@"shown":@(self.messagePopover.shown),@"paused":@(self.menuOpen),@"labels":labels,@"textFits":@(fits)}];return;
    }
    if(self.testing&&[action isEqual:@"testDismissCodexAlert"]){[self.codexAlerts.items removeAllObjects];[self refreshCodexButton];[self reply:identifier value:@{@"ok":@(self.codexButton.hidden)}];return;}
    if(self.testing&&[action isEqual:@"testFullScreenOverlay"]){
        NSURL *fixture=[[NSBundle.mainBundle.bundleURL URLByDeletingLastPathComponent] URLByAppendingPathComponent:@"OverlayFixture.app"];
        NSURL *output=[self.testRoot URLByAppendingPathComponent:@"fullscreen-result.json"];
        NSTask *task=[NSTask new];task.executableURL=[NSURL fileURLWithPath:@"/usr/bin/open"];
        task.arguments=@[@"-n",@"-W",fixture.path,@"--args",@"--result",output.path,@"--overlay",[NSString stringWithFormat:@"%ld",(long)self.window.windowNumber]];
        task.terminationHandler=^(NSTask *finished){dispatch_async(dispatch_get_main_queue(),^{
            NSData *bytes=[NSData dataWithContentsOfURL:output];NSDictionary *result=bytes?[NSJSONSerialization JSONObjectWithData:bytes options:0 error:NULL]:@{};
            [self.window orderFrontRegardless];
            [self reply:identifier value:@{@"ok":@(finished.terminationStatus==0),@"fixtureFullscreen":result[@"fullscreen"]?:@NO,@"fixtureActive":result[@"active"]?:@NO,@"overlayDiagnostics":result?:@{}}];
        });};
        NSError *error=nil;if(![task launchAndReturnError:&error]){[self reply:identifier value:@{@"ok":@NO}];}return;
    }

    if(self.testing&&[action isEqual:@"testMenuCommand"]){[self runMenuCommand:body[@"command"] completion:^(BOOL ok){[self reply:identifier value:@{@"ok":@(ok),@"moving":@(self.pendingMove)}];}];return;}
    if(self.testing&&[action isEqual:@"testWindowLifecycle"]){[self reply:identifier value:@{@"visible":@(self.window.visible),@"keepsRunning":@(![self applicationShouldTerminateAfterLastWindowClosed:NSApp]),@"webAttached":@(self.web.window==self.window),@"desktop":@(self.desktop)}];return;}
    if([action isEqual:@"hide"]) {[NSApp hide:nil];[self reply:identifier value:@{@"ok":@YES}];return;}
    if([action isEqual:@"storage"]) {[NSWorkspace.sharedWorkspace openURL:self.store.root];[self reply:identifier value:@{@"ok":@YES}];return;}
    if([action isEqual:@"importSkin"]) {
        if(self.store.readOnly){[self reply:identifier value:@{@"ok":@NO,@"error":@"存档处于保护模式，暂时不能更换皮肤。"}];return;}
        NSOpenPanel *panel=[NSOpenPanel openPanel];panel.allowedContentTypes=@[UTTypePNG,UTTypeJPEG,UTTypeGIF,UTTypeWebP];panel.allowsMultipleSelection=NO;panel.canChooseDirectories=NO;panel.message=@"选择图片或动图，最大 15 MB、60 帧。";
        [panel beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse response){if(response!=NSModalResponseOK){[self reply:identifier value:@{@"ok":@NO,@"cancelled":@YES}];return;}NSURL *url=panel.URL;
            self.pendingIO++;dispatch_async(self.io,^{NSError *error=nil;NSDictionary *result=[self.store importImage:url error:&error];dispatch_async(dispatch_get_main_queue(),^{[self reply:identifier value:result?:@{@"ok":@NO,@"error":error.localizedDescription?:@"皮肤导入失败。"}];[self ioFinished];});});}];return;
    }
    if([action isEqual:@"export"]) {
        NSSavePanel *panel=[NSSavePanel savePanel];panel.allowedContentTypes=@[UTTypeJSON];panel.nameFieldStringValue=@"心晴-心情记录.json";
        [panel beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse response){if(response!=NSModalResponseOK){[self reply:identifier value:@{@"ok":@NO,@"cancelled":@YES}];return;}NSURL *url=panel.URL;
            self.pendingIO++;dispatch_async(self.io,^{NSError *error=nil;NSData *bytes=[NSJSONSerialization dataWithJSONObject:self.store.state options:NSJSONWritingPrettyPrinted|NSJSONWritingSortedKeys error:&error];BOOL ok=bytes&&[bytes writeToURL:url options:NSDataWritingAtomic error:&error];dispatch_async(dispatch_get_main_queue(),^{[self reply:identifier value:ok?@{@"ok":@YES}:@{@"ok":@NO,@"error":error.localizedDescription?:@"导出失败。"}];[self ioFinished];});});}];return;
    }
    if(self.testing&&[action isEqual:@"testSnapshot"]) {[self snapshot:body[@"name"] reply:identifier];return;}
    if(self.testing&&[action isEqual:@"testFailNextSave"]){self.failNextSave=YES;[self reply:identifier value:@{@"ok":@YES}];return;}
    if(self.testing&&[action isEqual:@"testImportSkin"]){
        NSURL *url=[self.testRoot URLByAppendingPathComponent:@"synthetic.gif"];WriteSyntheticGIF(url);self.pendingIO++;
        dispatch_async(self.io,^{NSError *error=nil;NSDictionary *result=[self.store importImage:url error:&error];dispatch_async(dispatch_get_main_queue(),^{[self reply:identifier value:result?:@{@"ok":@NO,@"error":error.localizedDescription?:@"合成皮肤失败"}];[self ioFinished];});});return;
    }
    [self reply:identifier value:@{@"ok":@NO,@"error":@"不支持的本机操作。"}];
}

- (NSMenuItem *)menuItem:(NSString *)title command:(NSString *)command {
    NSMenuItem *item=[[NSMenuItem alloc] initWithTitle:title action:@selector(menuSelected:) keyEquivalent:@""];
    item.target=self;item.representedObject=command;return item;
}
- (NSMenu *)desktopMenu {
    NSMenu *menu=[[NSMenu alloc] initWithTitle:@"心晴"];menu.autoenablesItems=NO;
    NSMenuItem *moods=[[NSMenuItem alloc] initWithTitle:@"换个心情并记录" action:nil keyEquivalent:@""];
    NSMenu *choices=[NSMenu new];choices.autoenablesItems=NO;
    NSDictionary *state=self.store.state;NSString *current=[state[@"events"] lastObject][@"mood"];
    for(NSArray *entry in @[@[@"平静",@"calm"],@[@"开心",@"happy"],@[@"难过",@"sad"],@[@"焦虑",@"anxious"],@[@"烦躁",@"angry"],@[@"疲惫",@"tired"],@[@"无奈",@"resigned"],@[@"无语",@"speechless"],@[@"要死了",@"overwhelmed"]]){
        NSMenuItem *item=[self menuItem:entry[0] command:[@"mood:" stringByAppendingString:entry[1]]];
        item.state=[entry[1] isEqual:current]?NSControlStateValueOn:NSControlStateValueOff;
        item.enabled=!self.store.readOnly&&self.pendingIO==0;[choices addItem:item];
    }
    moods.submenu=choices;[menu addItem:moods];[menu addItem:NSMenuItem.separatorItem];
    NSMenuItem *follow=[self menuItem:@"跟随鼠标" command:@"follow"];follow.state=self.following?NSControlStateValueOn:NSControlStateValueOff;[menu addItem:follow];
    [menu addItem:[self menuItem:@"找回小球（默认大小）" command:@"recover"]];
    NSMenuItem *messages=[self menuItem:[NSString stringWithFormat:@"Codex 消息（%lu）",(unsigned long)self.codexAlerts.items.count] command:@"codexMessages"];[menu addItem:messages];
    for(NSArray *entry in @[@[@"摸摸它",@"stroke"],@[@"捏一下",@"squish"],@[@"移动小球（下次拖动）",@"move"]])[menu addItem:[self menuItem:entry[0] command:entry[1]]];
    [menu addItem:NSMenuItem.separatorItem];
    NSMenuItem *settings=[[NSMenuItem alloc] initWithTitle:@"设置" action:nil keyEquivalent:@""];
    NSMenuItem *sizeItem=[[NSMenuItem alloc] initWithTitle:@"小球大小（滚轮也可缩放）" action:nil keyEquivalent:@""];
    NSMenu *sizes=[NSMenu new];sizes.autoenablesItems=NO;
    for(NSArray *entry in @[@[@"默认小球 · 50%",@"size:0.5",@.5],@[@"适中 · 75%",@"size:0.75",@.75],@[@"标准 · 100%",@"size:1",@1],@[@"大 · 150%",@"size:1.5",@1.5],@[@"超大 · 200%",@"size:2",@2]]){
        NSMenuItem *item=[self menuItem:entry[0] command:entry[1]];item.state=fabs(self.desktopScale-[entry[2] doubleValue])<.015?NSControlStateValueOn:NSControlStateValueOff;[sizes addItem:item];
    }
    sizeItem.submenu=sizes;[menu addItem:sizeItem];
    NSMenu *options=[NSMenu new];options.autoenablesItems=NO;
    for(NSArray *entry in @[@[@"换个模样…",@"skin"],@[@"恢复小糯团",@"resetSkin"],@[@"导出心情记录…",@"export"],@[@"打开存档位置",@"storage"]]){
        NSMenuItem *item=[self menuItem:entry[0] command:entry[1]];
        if([entry[1] isEqual:@"resetSkin"])item.enabled=[state[@"skin"] isKindOfClass:NSDictionary.class]&&!self.store.readOnly&&self.pendingIO==0;
        if([entry[1] isEqual:@"skin"])item.enabled=!self.store.readOnly&&self.pendingIO==0;
        [options addItem:item];
    }
    settings.submenu=options;[menu addItem:settings];
    [menu addItem:[self menuItem:@"打开心情日历" command:@"calendar"]];
    [menu addItem:[self menuItem:@"暂时收起小球" command:@"hide"]];
    [menu addItem:NSMenuItem.separatorItem];[menu addItem:[self menuItem:@"退出心晴" command:@"quit"]];
    return menu;
}
- (NSArray *)describeMenu:(NSMenu *)menu {
    NSMutableArray *items=[NSMutableArray new];
    for(NSMenuItem *item in menu.itemArray){
        if(item.isSeparatorItem)continue;
        NSMutableDictionary *data=[@{@"title":item.title,@"enabled":@(item.enabled),@"checked":@(item.state==NSControlStateValueOn)} mutableCopy];
        if(item.representedObject)data[@"command"]=item.representedObject;
        if(item.submenu)data[@"children"]=[self describeMenu:item.submenu];
        [items addObject:data];
    }
    return items;
}
- (void)runMenuCommand:(NSString *)command completion:(void (^)(BOOL))completion {
    if(![command isKindOfClass:NSString.class]){if(completion)completion(NO);return;}
    if([command isEqual:@"recover"]){
        if(self.desktop){[self recoverDesktop];if(completion)completion(YES);return;}
        [self.web callAsyncJavaScript:@"await window.moodApp.ready; await window.moodApp.desktop(true); return window.moodApp.mini;" arguments:@{} inFrame:nil inContentWorld:WKContentWorld.pageWorld completionHandler:^(id result,NSError *error){BOOL ok=!error&&[result isKindOfClass:NSNumber.class]&&[result boolValue];if(ok)[self recoverDesktop];if(completion)completion(ok);}];return;
    }
    if([command isEqual:@"codexMessages"]){[self showCodexMessages:nil];if(completion)completion(YES);return;}
    if([@[@"size:0.5",@"size:0.75",@"size:1",@"size:1.5",@"size:2"] containsObject:command]){BOOL ok=self.desktop;if(ok)[self resizeDesktopTo:[[command substringFromIndex:5] doubleValue]];if(completion)completion(ok);return;}
    if([command isEqual:@"follow"]){self.following=!self.following;self.followResumeAt=NSProcessInfo.processInfo.systemUptime+.8;if(completion)completion(YES);return;}
    if([command isEqual:@"move"]){self.pendingMove=YES;if(completion)completion(YES);return;}
    if([command isEqual:@"hide"]){[NSApp hide:nil];if(completion)completion(YES);return;}
    if([command isEqual:@"quit"]){if(completion)completion(YES);[NSApp terminate:nil];return;}
    if([command isEqual:@"calendar"]){[NSApp unhide:nil];[NSApp activateIgnoringOtherApps:YES];}
    [self.web callAsyncJavaScript:@"return await window.moodApp.menuAction(command)" arguments:@{@"command":command} inFrame:nil inContentWorld:WKContentWorld.pageWorld completionHandler:^(id result,NSError *error){
        BOOL ok=!error&&[result isKindOfClass:NSNumber.class]&&[result boolValue];if(completion)completion(ok);
    }];
}
- (void)menuSelected:(NSMenuItem *)item {[self runMenuCommand:item.representedObject completion:nil];}
- (void)recoverDesktop {
    if(!self.desktop)return;
    self.following=NO;self.pendingMove=NO;self.followResumeAt=NSProcessInfo.processInfo.systemUptime+2;
    [NSApp unhide:nil];NSScreen *target=NSScreen.mainScreen;NSPoint pointer=NSEvent.mouseLocation;
    for(NSScreen *screen in NSScreen.screens)if(NSPointInRect(pointer,screen.frame)){target=screen;break;}
    if(!target)return;
    NSRect area=target.visibleFrame,center=NSMakeRect(NSMidX(area)-85,NSMidY(area)-75,170,150);
    center=MoodDesktopFrame(center,area,.5);self.desktopScale=center.size.width/340.;self.displayID=[target.deviceDescription[@"NSScreenNumber"] description];
    [self.window setFrame:center display:YES];self.window.level=NSStatusWindowLevel;[self.window orderFrontRegardless];
    [self.web evaluateJavaScript:@"window.moodApp?.pet.release();window.moodApp?.pet.resize()" completionHandler:nil];
}

- (void)applyPetTint:(id)hex {
    if(![hex isKindOfClass:NSString.class]||[hex length]!=7||![hex hasPrefix:@"#"])return;
    NSCharacterSet *invalid=[[NSCharacterSet characterSetWithCharactersInString:@"0123456789abcdefABCDEF"] invertedSet];
    if([[hex substringFromIndex:1] rangeOfCharacterFromSet:invalid].location!=NSNotFound)return;
    unsigned int rgb=0;[[NSScanner scannerWithString:[hex substringFromIndex:1]] scanHexInt:&rgb];
    NSColor *base=[NSColor colorWithSRGBRed:((rgb>>16)&255)/255. green:((rgb>>8)&255)/255. blue:(rgb&255)/255. alpha:1];
    self.petTintHex=hex;self.messageBaseColor=base;
    self.codexButton.layer.backgroundColor=[[[base blendedColorWithFraction:.55 ofColor:NSColor.whiteColor] colorWithAlphaComponent:.84] CGColor];
    self.codexButton.layer.borderColor=[[base colorWithAlphaComponent:.25] CGColor];
    self.messagePopover.contentViewController.view.layer.backgroundColor=[[base blendedColorWithFraction:.86 ofColor:NSColor.whiteColor] CGColor];
}
- (void)refreshCodexButton {
    NSUInteger count=self.codexAlerts.items.count;BOOL approval=NO,question=NO;
    for(NSDictionary *item in self.codexAlerts.items){approval|=[item[@"kind"] isEqual:@"approval"];question|=[item[@"kind"] isEqual:@"question"];}
    NSString *label=approval?@"等你点头 🐾":question?@"有个小问题 💭":@"叮～Codex 有消息啦";
    NSString *title=[NSString stringWithFormat:@"%@ · %lu",label,(unsigned long)count];
    NSMutableParagraphStyle *paragraph=[NSMutableParagraphStyle new];paragraph.alignment=NSTextAlignmentCenter;
    self.codexButton.attributedTitle=[[NSAttributedString alloc] initWithString:title attributes:@{NSForegroundColorAttributeName:[NSColor colorWithSRGBRed:.25 green:.21 blue:.18 alpha:1],NSFontAttributeName:self.codexButton.font,NSParagraphStyleAttributeName:paragraph}];
    self.codexButton.toolTip=@"戳戳我，看看 Codex 送来的小纸条；点一条就回到对应聊天";
    self.codexButton.hidden=count==0;
    if(self.messagePopover.shown){self.messagePopover.contentViewController=[self codexMessageContent];self.messagePopover.contentSize=self.messagePopover.contentViewController.view.frame.size;}
    // Metadata-only receipt lets the local bridge verify delivery without reading chats or screenshots.
    NSMutableArray *receipts=[NSMutableArray new];
    for(NSDictionary *item in self.codexAlerts.items)[receipts addObject:@{@"id":item[@"id"],@"kind":item[@"kind"]}];
    NSDictionary *status=@{@"version":@1,@"checkedAt":@(NSDate.date.timeIntervalSince1970),@"pid":@(NSProcessInfo.processInfo.processIdentifier),@"unread":@(count),@"badgeVisible":@(!self.codexButton.hidden&&self.codexButton.window!=nil),@"events":receipts};
    NSData *bytes=[NSJSONSerialization dataWithJSONObject:status options:0 error:NULL];
    NSURL *statusURL=[self.store.root URLByAppendingPathComponent:@"CodexDeliveryStatus.json"];
    dispatch_async(self.io,^{if([bytes writeToURL:statusURL options:NSDataWritingAtomic error:NULL])[NSFileManager.defaultManager setAttributes:@{NSFilePosixPermissions:@0600} ofItemAtPath:statusURL.path error:NULL];});
}
- (void)checkCodexMessages {
    if(self.alertPolling)return;self.alertPolling=YES;
    dispatch_async(self.io,^{NSArray *events=[self.codexAlerts readEvents];dispatch_async(dispatch_get_main_queue(),^{self.alertPolling=NO;BOOL changed=NO;for(NSDictionary *event in events)changed=[self.codexAlerts accept:event]||changed;if(changed)[self refreshCodexButton];});});
}
- (NSViewController *)codexMessageContent {
    NSUInteger count=self.codexAlerts.items.count;
    CGFloat width=280,rows=MAX(1,MIN(3,count)),height=68+rows*96;
    NSViewController *controller=[NSViewController new];
    NSView *root=[[NSView alloc] initWithFrame:NSMakeRect(0,0,width,height)];controller.view=root;
    root.wantsLayer=YES;root.layer.backgroundColor=[[self.messageBaseColor blendedColorWithFraction:.86 ofColor:NSColor.whiteColor] CGColor];
    NSTextField *heading=[NSTextField labelWithString:@"给你的小纸条"];
    heading.font=[NSFont systemFontOfSize:13 weight:NSFontWeightSemibold];heading.textColor=[NSColor colorWithSRGBRed:.24 green:.22 blue:.28 alpha:1];heading.frame=NSMakeRect(16,height-32,140,18);[root addSubview:heading];
    NSTextField *source=[NSTextField labelWithString:[NSString stringWithFormat:@"Codex · %lu",(unsigned long)count]];
    source.font=[NSFont systemFontOfSize:10];source.textColor=NSColor.secondaryLabelColor;source.alignment=NSTextAlignmentRight;source.frame=NSMakeRect(202,height-31,62,16);[root addSubview:source];
    NSScrollView *scroll=[[NSScrollView alloc] initWithFrame:NSMakeRect(12,24,256,rows*96)];
    scroll.borderType=NSNoBorder;scroll.drawsBackground=NO;scroll.hasVerticalScroller=YES;scroll.autohidesScrollers=YES;
    MoodMessageList *list=[[MoodMessageList alloc] initWithFrame:NSMakeRect(0,0,256,MAX(1,count)*96)];scroll.documentView=list;[root addSubview:scroll];
    NSDateFormatter *format=[NSDateFormatter new];format.dateFormat=@"HH:mm";
    NSUInteger index=0;
    for(NSDictionary *event in self.codexAlerts.items){
        NSString *kind=event[@"kind"],*label=[kind isEqual:@"completed"]?@"✨ 本轮回复完成":[kind isEqual:@"approval"]?@"🐾 等你点头就好":@"💭 有个小问题想问你";
        NSString *time=[format stringFromDate:[NSDate dateWithTimeIntervalSince1970:[event[@"at"] doubleValue]]];
        NSString *fullTitle=[event[@"title"] length]?event[@"title"]:@"未命名会话";
        NSString *displayTitle=fullTitle.length>36?[[fullTitle substringWithRange:[fullTitle rangeOfComposedCharacterSequencesForRange:NSMakeRange(0,36)]] stringByAppendingString:@"…"]:fullTitle;
        NSMutableAttributedString *text=[[NSMutableAttributedString alloc] initWithString:displayTitle attributes:@{NSFontAttributeName:[NSFont systemFontOfSize:13 weight:NSFontWeightMedium],NSForegroundColorAttributeName:[NSColor colorWithSRGBRed:.24 green:.22 blue:.28 alpha:1]}];
        [text appendAttributedString:[[NSAttributedString alloc] initWithString:[NSString stringWithFormat:@"\n%@\n%@  ·  第 %lu 张",label,time,(unsigned long)index+1] attributes:@{NSFontAttributeName:[NSFont systemFontOfSize:10],NSForegroundColorAttributeName:NSColor.secondaryLabelColor}]];
        NSMutableParagraphStyle *paragraph=[NSMutableParagraphStyle new];paragraph.alignment=NSTextAlignmentLeft;paragraph.lineSpacing=4;
        [text addAttribute:NSParagraphStyleAttributeName value:paragraph range:NSMakeRange(0,text.length)];
        MoodMessageButton *button=[[MoodMessageButton alloc] initWithFrame:NSMakeRect(4,index*96,244,96)];
        button.bordered=NO;button.attributedTitle=text;button.target=self;button.action=@selector(openCodexMessage:);button.messageEvent=event;button.toolTip=fullTitle;
        button.cell.wraps=YES;button.cell.usesSingleLineMode=NO;button.cell.lineBreakMode=NSLineBreakByWordWrapping;
        [button setAccessibilityLabel:[NSString stringWithFormat:@"%@，%@，%@",fullTitle,label,time]];[list addSubview:button];
        if(index){NSView *line=[[NSView alloc] initWithFrame:NSMakeRect(6,index*96,240,.5)];line.wantsLayer=YES;line.layer.backgroundColor=[NSColor colorWithWhite:.5 alpha:.12].CGColor;[list addSubview:line];}
        index++;
    }
    if(!count){NSTextField *empty=[NSTextField labelWithString:@"小耳朵竖好啦，等新消息"];
        empty.font=[NSFont systemFontOfSize:12];empty.textColor=NSColor.secondaryLabelColor;empty.frame=NSMakeRect(8,22,192,18);[list addSubview:empty];}
    NSTextField *hint=[NSTextField labelWithString:count?@"点开纸条，回到对应聊天 ↗":@"有新消息时，我会告诉你"];
    hint.font=[NSFont systemFontOfSize:10];hint.textColor=NSColor.secondaryLabelColor;hint.frame=NSMakeRect(18,9,202,14);[root addSubview:hint];
    return controller;
}
- (void)showCodexMessages:(id)sender {
    if(self.messagePopover.shown){[self.messagePopover performClose:nil];return;}
    self.messagePopover=[NSPopover new];self.messagePopover.behavior=NSPopoverBehaviorTransient;self.messagePopover.animates=NO;
    self.messagePopover.appearance=[NSAppearance appearanceNamed:NSAppearanceNameAqua];self.messagePopover.delegate=self;
    self.messagePopover.contentViewController=[self codexMessageContent];self.messagePopover.contentSize=self.messagePopover.contentViewController.view.frame.size;
    [NSApp unhide:nil];[self.window orderFrontRegardless];self.menuOpen=YES;
    NSRect anchor=[self.codexButton convertRect:self.codexButton.bounds toView:self.web];
    [self.messagePopover showRelativeToRect:anchor ofView:self.web preferredEdge:NSMinXEdge];
}
- (void)popoverDidClose:(NSNotification *)notification {self.menuOpen=NO;self.followResumeAt=NSProcessInfo.processInfo.systemUptime+1;}
- (void)openCodexMessage:(MoodMessageButton *)sender {
    NSDictionary *event=sender.messageEvent;
    if(![self.codexAlerts.items containsObject:event])return;
    NSURL *url=[CodexAlerts chatURL:event];
    if(url&&[NSWorkspace.sharedWorkspace openURL:url]){[self.messagePopover performClose:nil];[self.codexAlerts dismiss:event[@"id"]];[self refreshCodexButton];}
}
- (void)keepOnPointerScreen {
    if(!self.desktop||self.dragging||self.menuOpen||NSEvent.pressedMouseButtons||NSApp.hidden)return;
    NSScreen *target=nil;NSPoint pointer=NSEvent.mouseLocation;
    for(NSScreen *screen in NSScreen.screens)if(NSPointInRect(pointer,screen.frame)){target=screen;break;}
    if(!target)target=NSScreen.mainScreen;if(!target)return;
    NSString *identifier=[target.deviceDescription[@"NSScreenNumber"] description];
    if([identifier isEqual:self.displayID])return;
    NSRect previous=(self.window.screen?:target).visibleFrame,frame=self.window.frame;
    frame=MoodDesktopFrame(frame,target.visibleFrame,self.desktopScale);
    frame.origin=MoodTransferScreen(self.window.frame,previous,target.visibleFrame);
    frame=MoodDesktopFrame(frame,target.visibleFrame,frame.size.width/340.);
    [self.window setFrame:frame display:YES];[self.window orderFrontRegardless];self.displayID=identifier;
}
- (void)refreshOverlayAfterSpaceChange {
    if(!self.desktop||NSApp.hidden)return;
    [self keepOnPointerScreen];self.window.level=NSStatusWindowLevel;[self.window orderFrontRegardless];
    [self.web setNeedsDisplay:YES];[self.window displayIfNeeded];
    [self.web evaluateJavaScript:@"window.moodApp?.pet.draw()" completionHandler:nil];
}

- (void)resizeDesktopTo:(CGFloat)scale {
    if(!self.desktop||!isfinite(scale))return;
    NSRect visible=(self.window.screen?:NSScreen.mainScreen).visibleFrame;
    NSRect frame=MoodDesktopFrame(self.window.frame,visible,scale);
    self.desktopScale=frame.size.width/340.;self.followResumeAt=NSProcessInfo.processInfo.systemUptime+1.2;
    [self.window setFrame:frame display:YES];
}
- (void)windowWillMove:(NSNotification *)notification {
    if(notification.object==self.window)self.lastMotionFrame=self.window.frame;
}
- (void)windowDidMove:(NSNotification *)notification {
    if(!self.desktop||notification.object!=self.window)return;
    NSRect frame=self.window.frame,previous=self.lastMotionFrame;self.lastMotionFrame=frame;
    if(self.directMove)return;
    BOOL followingMove=self.following&&!self.menuOpen&&!self.pendingMove&&NSProcessInfo.processInfo.systemUptime>=self.followResumeAt&&NSEvent.pressedMouseButtons==0;
    if((!self.dragging&&!followingMove)||!NSEqualSizes(previous.size,frame.size)||NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceMotion)return;
    CGFloat dx=frame.origin.x-previous.origin.x,dy=frame.origin.y-previous.origin.y;
    if(hypot(dx,dy)>frame.size.height*.65)return;
    [self sendRollingBy:NSMakePoint(dx,dy)];
}
- (BOOL)handleDesktopDragEvent:(NSEvent *)event {
    NSPoint pointer=event.window?[event.window convertPointToScreen:event.locationInWindow]:NSEvent.mouseLocation;
    return [self handleDesktopDrag:event at:pointer];
}
- (BOOL)handleDesktopDrag:(NSEvent *)event at:(NSPoint)pointer {
    if(!self.desktop)return NO;
    if(event.type==NSEventTypeLeftMouseDown&&MoodShouldDrag(self.pendingMove,event.modifierFlags)){
        self.pendingMove=NO;self.dragging=YES;self.dragMouseStart=pointer;self.dragFrameStart=self.window.frame;return YES;
    }
    if(!self.dragging)return NO;
    if(event.type==NSEventTypeLeftMouseDragged){
        NSPoint origin=NSMakePoint(self.dragFrameStart.origin.x+pointer.x-self.dragMouseStart.x,self.dragFrameStart.origin.y+pointer.y-self.dragMouseStart.y);
        [self moveDesktopTo:origin rolling:YES];return YES;
    }
    if(event.type==NSEventTypeLeftMouseUp||(event.type==NSEventTypeKeyDown&&event.keyCode==53)){
        self.dragging=NO;self.followResumeAt=NSProcessInfo.processInfo.systemUptime+1.2;return YES;
    }
    return NO;
}
- (void)moveDesktopTo:(NSPoint)origin rolling:(BOOL)rolling {
    NSPoint old=self.window.frame.origin;self.directMove=YES;[self.window setFrameOrigin:origin];self.directMove=NO;self.lastMotionFrame=self.window.frame;
    CGFloat dx=self.window.frame.origin.x-old.x,dy=self.window.frame.origin.y-old.y;
    CGFloat limit=self.window.frame.size.height*.65,factor=MIN(1,limit/MAX(.1,hypot(dx,dy)));
    if(rolling&&!NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceMotion)[self sendRollingBy:NSMakePoint(dx*factor,dy*factor)];
}
- (void)sendRollingBy:(NSPoint)delta {
    self.queuedRoll=NSMakePoint(self.queuedRoll.x+delta.x,self.queuedRoll.y+delta.y);
    if(self.rollPending)return;self.rollPending=YES;
    NSPoint movement=self.queuedRoll;self.queuedRoll=NSZeroPoint;
    [self.web callAsyncJavaScript:@"window.moodApp.pet.rollBy(dx,dy)" arguments:@{@"dx":@(movement.x),@"dy":@(movement.y)} inFrame:nil inContentWorld:WKContentWorld.pageWorld completionHandler:^(id result,NSError *error){self.rollPending=NO;if(hypot(self.queuedRoll.x,self.queuedRoll.y)>.1)[self sendRollingBy:NSZeroPoint];}];
}

- (void)updateDesktopPointer {
    if(!self.desktop||!self.window.visible||NSApp.hidden||self.window.attachedSheet){self.lastPointerTick=0;return;}
    NSTimeInterval now=NSProcessInfo.processInfo.systemUptime,dt=self.lastPointerTick?now-self.lastPointerTick:.05;
    self.lastPointerTick=now;
    [self keepOnPointerScreen];
    NSPoint cursor=NSEvent.mouseLocation;NSScreen *screen=nil;
    for(NSScreen *candidate in NSScreen.screens)if(NSPointInRect(cursor,candidate.frame)){screen=candidate;break;}
    if(!screen)return;
    BOOL paused=self.dragging||self.menuOpen||self.pendingMove||now<self.followResumeAt;
    if(MoodShouldFollow(self.following,self.desktop,self.window.visible,paused,NSEvent.pressedMouseButtons)){
        NSPoint origin=MoodFollowOrigin(self.window.frame,screen.visibleFrame,cursor,dt,NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceMotion);
        if(!NSEqualPoints(origin,self.window.frame.origin))[self moveDesktopTo:origin rolling:YES];
    }
    if(self.gazePending||self.menuOpen)return;
    NSRect frame=self.window.frame;
    CGFloat x=MAX(-1,MIN(1,(cursor.x-NSMidX(frame))/250));
    CGFloat y=MAX(-1,MIN(1,(cursor.y-NSMidY(frame))/250));
    if(hypot(x-self.lastGaze.x,y-self.lastGaze.y)<.025)return;
    self.lastGaze=NSMakePoint(x,y);self.gazePending=YES;
    [self.web callAsyncJavaScript:@"window.moodApp.pet.lookAtDesktop(x,y)" arguments:@{@"x":@(x),@"y":@(y)} inFrame:nil inContentWorld:WKContentWorld.pageWorld completionHandler:^(id result,NSError *error){self.gazePending=NO;}];
}

- (void)applyDesktop:(BOOL)enabled {
    [self.messagePopover performClose:nil];
    if(enabled==self.desktop)return;
    self.desktop=enabled;
    self.lastPointerTick=0;
    PetWindow *oldDesktopPanel=nil;
    if(enabled) {
        self.expandedFrame=self.window.frame;self.calendarWindow=self.window;
        [self.calendarWindow orderOut:nil];self.calendarWindow.contentView=[NSView new];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
        self.window=[[PetWindow alloc] initWithContentRect:NSMakeRect(0,0,340*self.desktopScale,300*self.desktopScale) styleMask:NSWindowStyleMaskBorderless|NSWindowStyleMaskNonactivatingPanel backing:NSBackingStoreBuffered defer:NO];
        self.window.title=@"心晴 · 桌面小球";self.window.delegate=self;self.window.releasedWhenClosed=NO;self.window.hidesOnDeactivate=NO;self.window.contentView=self.web;
        self.window.floatingPanel=YES;self.window.becomesKeyOnlyIfNeeded=YES;
        self.window.contentMinSize=NSMakeSize(170,150);
        self.window.opaque=NO;self.window.backgroundColor=NSColor.clearColor;self.window.hasShadow=NO;self.window.level=NSStatusWindowLevel;
        self.window.collectionBehavior=NSWindowCollectionBehaviorCanJoinAllSpaces|NSWindowCollectionBehaviorFullScreenAuxiliary|NSWindowCollectionBehaviorCanJoinAllApplications|NSWindowCollectionBehaviorIgnoresCycle;
        [self.window setContentSize:NSMakeSize(340*self.desktopScale,300*self.desktopScale)];
        NSRect visible=(self.window.screen?:NSScreen.mainScreen).visibleFrame;NSRect frame=self.window.frame;
        frame.origin=self.testing?NSMakePoint(NSMidX(visible)-frame.size.width/2,NSMidY(visible)-frame.size.height/2):NSMakePoint(NSMaxX(visible)-frame.size.width-26,NSMinY(visible)+30);[self.window setFrame:frame display:YES];
        [self resizeDesktopTo:self.desktopScale];
        self.lastMotionFrame=self.window.frame;
        self.displayID=[(self.window.screen?:NSScreen.mainScreen).deviceDescription[@"NSScreenNumber"] description];

    } else {
        self.pendingMove=NO;oldDesktopPanel=self.window;oldDesktopPanel.contentView=[NSView new];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
        self.window=self.calendarWindow;self.calendarWindow=nil;self.window.contentView=self.web;
        self.window.contentMinSize=NSMakeSize(790,720);self.window.opaque=YES;self.window.backgroundColor=[NSColor colorWithCalibratedRed:.973 green:.969 blue:.949 alpha:1];self.window.hasShadow=YES;self.window.level=NSNormalWindowLevel;self.window.collectionBehavior=NSWindowCollectionBehaviorMoveToActiveSpace|NSWindowCollectionBehaviorFullScreenAuxiliary|NSWindowCollectionBehaviorCanJoinAllApplications;
        [self.window setFrame:self.expandedFrame display:YES];
    }
    [self.window makeKeyAndOrderFront:nil];
    // Keep the restored calendar visible before the outgoing panel closes.
    if(oldDesktopPanel){[oldDesktopPanel close];[NSApp activateIgnoringOtherApps:YES];}
}
- (void)webView:(WKWebView *)view decidePolicyForNavigationAction:(WKNavigationAction *)action decisionHandler:(void (^)(WKNavigationActionPolicy))handler {
    NSURL *index=[[NSBundle.mainBundle.resourceURL URLByAppendingPathComponent:@"web"] URLByAppendingPathComponent:@"index.html"];
    handler(action.request.URL.isFileURL&&[action.request.URL.standardizedURL.path isEqual:index.standardizedURL.path]?WKNavigationActionPolicyAllow:WKNavigationActionPolicyCancel);
}
- (void)webViewWebContentProcessDidTerminate:(WKWebView *)webView {[self fatal:@"显示进程意外退出。已保存的心情仍在本机，请重新打开心晴。" error:nil];}
- (void)webView:(WKWebView *)webView didFailNavigation:(WKNavigation *)navigation withError:(NSError *)error {[self fatal:@"心情日历加载失败。" error:error];}
- (void)webView:(WKWebView *)webView didFailProvisionalNavigation:(WKNavigation *)navigation withError:(NSError *)error {[self fatal:@"无法加载本地界面。" error:error];}
- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
    if(!self.testing&&[NSProcessInfo.processInfo.arguments containsObject:@"--show-pet"]){[self runMenuCommand:@"recover" completion:nil];return;}
    if(!self.testing||self.testStarted)return;self.testStarted=YES;
    NSURL *testURL=[NSBundle.mainBundle.resourceURL URLByAppendingPathComponent:@"integration.js"];
    NSString *script=[NSString stringWithContentsOfURL:testURL encoding:NSUTF8StringEncoding error:NULL];
    if(!script){[self finish:@"缺少集成测试脚本"];return;}
    [self.web callAsyncJavaScript:script arguments:@{} inFrame:nil inContentWorld:WKContentWorld.pageWorld completionHandler:^(id result,NSError *error){
        if(error||![result isKindOfClass:NSArray.class]){[self finish:error.userInfo[@"WKJavaScriptExceptionMessage"]?:error.localizedDescription?:@"集成测试未返回结果"];return;}
        if(self.desktop||self.window.level!=NSNormalWindowLevel){[self finish:@"原生窗口恢复失败"];return;}
        NSError *loadError=nil;NSData *bytes=[NSData dataWithContentsOfURL:[self.store.root URLByAppendingPathComponent:@"moods.json"] options:0 error:&loadError];NSDictionary *disk=bytes?[NSJSONSerialization JSONObjectWithData:bytes options:0 error:&loadError]:nil;
        if(loadError||![MoodStore validState:disk]||[disk[@"events"] count]!=[self.store.state[@"events"] count]){[self finish:@"磁盘存档回读失败"];return;}
        if(self.artifacts){[NSFileManager.defaultManager createDirectoryAtURL:self.artifacts withIntermediateDirectories:YES attributes:nil error:NULL];NSData *report=[NSJSONSerialization dataWithJSONObject:@{@"status":@"passed",@"checkedAt":[NSISO8601DateFormatter.new stringFromDate:NSDate.date],@"checks":result,@"nativeDiskReadback":@YES,@"nativeWindowRestored":@YES,@"syntheticData":@YES} options:NSJSONWritingPrettyPrinted error:NULL];[report writeToURL:[self.artifacts URLByAppendingPathComponent:@"integration.json"] options:NSDataWritingAtomic error:NULL];}
        printf("PASS: %lu WebKit integration checks, native window restoration, real temporary-disk readback\n",(unsigned long)[result count]);[self finish:nil];
    }];
}
- (void)seedSyntheticHistory {
    NSMutableDictionary *state=[self.store.state mutableCopy];NSMutableArray *events=[NSMutableArray new];NSArray *moods=@[@"calm",@"happy",@"tired",@"sad",@"anxious",@"angry"];
    NSDateFormatter *f=[NSDateFormatter new];f.locale=[[NSLocale alloc] initWithLocaleIdentifier:@"en_US_POSIX"];f.dateFormat=@"yyyy-MM-dd";
    NSCalendar *calendar=NSCalendar.currentCalendar;NSDate *now=NSDate.date;
    for(int i=20;i>0;i--){if(i%4==0)continue;NSDate *date=[calendar dateByAddingUnit:NSCalendarUnitDay value:-i toDate:now options:0];NSString *day=[f stringFromDate:date];[events addObject:@{@"id":[NSString stringWithFormat:@"synthetic-day-%d",i],@"mood":moods[i%6],@"at":@((long long)(date.timeIntervalSince1970*1000)),@"day":day,@"note":i%3==0?@"合成演示记录，不是真实心情。":@"",@"offset":@(-[NSTimeZone.localTimeZone secondsFromGMTForDate:date]/60)}];}
    NSDate *yesterday=[calendar dateByAddingUnit:NSCalendarUnitDay value:-1 toDate:now options:0];NSString *yesterdayKey=[f stringFromDate:yesterday];
    NSIndexSet *old=[events indexesOfObjectsPassingTest:^BOOL(NSDictionary *entry,NSUInteger index,BOOL *stop){return [entry[@"day"] isEqual:yesterdayKey];}];[events removeObjectsAtIndexes:old];
    NSArray *samples=@[@[@9,@10,@"happy",@"合成示例：慢慢开始的一天"],@[@11,@40,@"calm",@"合成示例：安静做事"],@[@14,@25,@"angry",@"合成示例：有一点烦躁"],@[@18,@20,@"happy",@"合成示例：下班后散步"]];
    for(NSUInteger i=0;i<samples.count;i++){NSArray *sample=samples[i];NSDate *at=[calendar dateBySettingHour:[sample[0] integerValue] minute:[sample[1] integerValue] second:0 ofDate:yesterday options:0];
        [events addObject:@{@"id":[NSString stringWithFormat:@"synthetic-axis-%lu",(unsigned long)i],@"mood":sample[2],@"at":@((long long)(at.timeIntervalSince1970*1000)),@"day":yesterdayKey,@"note":sample[3],@"offset":@(-[NSTimeZone.localTimeZone secondsFromGMTForDate:at]/60)}];
    }
    state[@"events"]=events;[self.store save:state error:NULL];
}
- (void)snapshot:(NSString *)name reply:(NSNumber *)identifier {
    if(self.artifacts&&[@[@"paper-completed.png",@"paper-approval.png",@"paper-question.png"] containsObject:name]){
        NSView *view=self.messagePopover.contentViewController.view;
        if(!self.messagePopover.shown||!view){[self reply:identifier value:@{@"ok":@NO}];return;}
        [view layoutSubtreeIfNeeded];[view displayIfNeeded];
        NSBitmapImageRep *bitmap=[view bitmapImageRepForCachingDisplayInRect:view.bounds];
        [view cacheDisplayInRect:view.bounds toBitmapImageRep:bitmap];
        NSData *png=[bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
        [NSFileManager.defaultManager createDirectoryAtURL:self.artifacts withIntermediateDirectories:YES attributes:nil error:NULL];
        BOOL ok=png&&[png writeToURL:[self.artifacts URLByAppendingPathComponent:name] options:NSDataWritingAtomic error:NULL];
        [self reply:identifier value:@{@"ok":@(ok)}];return;
    }
    if(!self.artifacts||![@[@"calendar.png",@"squashed.png",@"stretch.png",@"desktop.png",@"rolling.png",@"happy-bandaged.png",@"time-axis.png",@"skin.png",@"mood-calm.png",@"mood-happy.png",@"mood-sad.png",@"mood-angry.png",@"mood-anxious.png",@"mood-tired.png",@"mood-resigned.png",@"mood-speechless.png",@"mood-overwhelmed.png",@"gaze-0.png",@"gaze-1.png",@"gaze-2.png",@"gaze-3.png",@"gaze-4.png",@"gaze-5.png"] containsObject:name]){[self reply:identifier value:@{@"ok":@YES,@"skipped":@YES}];return;}
    [NSFileManager.defaultManager createDirectoryAtURL:self.artifacts withIntermediateDirectories:YES attributes:nil error:NULL];
    WKSnapshotConfiguration *configuration=[WKSnapshotConfiguration new];configuration.afterScreenUpdates=YES;
    [self.web takeSnapshotWithConfiguration:configuration completionHandler:^(NSImage *image,NSError *error){NSBitmapImageRep *bitmap=image?[[NSBitmapImageRep alloc] initWithData:image.TIFFRepresentation]:nil;NSData *png=[bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];BOOL ok=png&&[png writeToURL:[self.artifacts URLByAppendingPathComponent:name] options:NSDataWritingAtomic error:NULL];[self reply:identifier value:@{@"ok":@(ok),@"error":error.localizedDescription?:@""}];}];
}
- (void)finish:(NSString *)error {
    self.finished=YES;
    if(error&&self.testing&&self.artifacts){[NSFileManager.defaultManager createDirectoryAtURL:self.artifacts withIntermediateDirectories:YES attributes:nil error:NULL];NSData *report=[NSJSONSerialization dataWithJSONObject:@{@"status":[error containsString:@"PRECONDITION:"]?@"blocked":@"failed",@"checkedAt":[NSISO8601DateFormatter.new stringFromDate:NSDate.date],@"error":error,@"syntheticData":@YES} options:NSJSONWritingPrettyPrinted error:NULL];[report writeToURL:[self.artifacts URLByAppendingPathComponent:@"integration.json"] options:NSDataWritingAtomic error:NULL];}
    if(self.lockFD>=0){flock(self.lockFD,LOCK_UN);close(self.lockFD);self.lockFD=-1;}
    if(self.testRoot)[NSFileManager.defaultManager removeItemAtURL:self.testRoot error:NULL];
    if(error){fprintf(stderr,"FAIL: %s\n",error.UTF8String);exit(1);}exit(0);
}
- (NSApplicationTerminateReply)applicationShouldTerminate:(NSApplication *)sender {if(self.pendingIO){self.terminating=YES;return NSTerminateLater;}return NSTerminateNow;}
- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender{return !self.desktop&&!self.window.visible;}
- (BOOL)applicationShouldHandleReopen:(NSApplication *)sender hasVisibleWindows:(BOOL)visible {
    [self runMenuCommand:@"recover" completion:nil];return YES;
}
- (void)applicationWillTerminate:(NSNotification *)notification {[self.pointerTimer invalidate];[self.alertTimer invalidate];if(self.displayObserver)[NSNotificationCenter.defaultCenter removeObserver:self.displayObserver];if(self.spaceObserver)[NSWorkspace.sharedWorkspace.notificationCenter removeObserver:self.spaceObserver];if(self.inputMonitor)[NSEvent removeMonitor:self.inputMonitor];if(self.lockFD>=0){flock(self.lockFD,LOCK_UN);close(self.lockFD);}}
@end

int main(int argc,const char *argv[]) {
    @autoreleasepool {
        if([NSProcessInfo.processInfo.arguments containsObject:@"--storage-test"])return RunStorageTests()?0:1;
        NSApplication *application=NSApplication.sharedApplication;[application setActivationPolicy:NSApplicationActivationPolicyAccessory];MoodApp *delegate=[MoodApp new];application.delegate=delegate;[application run];
    }
    return 0;
}
