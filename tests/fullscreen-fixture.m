#import <Cocoa/Cocoa.h>
#import <unistd.h>

@interface OverlayFixture : NSObject <NSApplicationDelegate,NSWindowDelegate>
@property NSWindow *window;
@property NSTimer *sampler;
@property BOOL entered;
@property NSUInteger samples,consecutive;
@property NSDictionary *lastSample;
@end
@implementation OverlayFixture
- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    self.window=[[NSWindow alloc] initWithContentRect:NSMakeRect(100,100,800,600) styleMask:NSWindowStyleMaskTitled|NSWindowStyleMaskResizable backing:NSBackingStoreBuffered defer:NO];
    self.window.title=@"心晴全屏覆盖自检 · 自动关闭";
    self.window.delegate=self;
    self.window.backgroundColor=[NSColor colorWithCalibratedRed:.12 green:.2 blue:.29 alpha:1];
    self.window.collectionBehavior=NSWindowCollectionBehaviorFullScreenPrimary;
    [self.window makeKeyAndOrderFront:nil];[NSApp activateIgnoringOtherApps:YES];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW,NSEC_PER_SEC/2),dispatch_get_main_queue(),^{[self.window toggleFullScreen:nil];});
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW,12*NSEC_PER_SEC),dispatch_get_main_queue(),^{[self finishSample];});
}
- (void)windowDidEnterFullScreen:(NSNotification *)notification {
    self.entered=YES;
    self.sampler=[NSTimer scheduledTimerWithTimeInterval:.1 repeats:YES block:^(NSTimer *timer){[self sampleOverlay];}];
}
- (void)sampleOverlay {
    NSArray *args=NSProcessInfo.processInfo.arguments;NSUInteger index=[args indexOfObject:@"--overlay"];
    if(index==NSNotFound||index+1>=args.count){[self finishSample];return;}
    NSInteger overlay=[args[index+1] integerValue];
    NSArray *windows=CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly,kCGNullWindowID));
    NSDictionary *pet=nil,*fixture=nil;NSUInteger petIndex=NSNotFound,fixtureIndex=NSNotFound;
    for(NSUInteger i=0;i<windows.count;i++){
        NSDictionary *window=windows[i];
        if([window[(__bridge NSString *)kCGWindowNumber] integerValue]==overlay){pet=window;petIndex=i;}
        if([window[(__bridge NSString *)kCGWindowOwnerPID] intValue]==getpid()&&[window[(__bridge NSString *)kCGWindowLayer] intValue]==0){fixture=window;fixtureIndex=i;}
    }
    CGRect petRect=CGRectZero,fixtureRect=CGRectZero;
    if(pet)CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)pet[(__bridge NSString *)kCGWindowBounds],&petRect);
    if(fixture)CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)fixture[(__bridge NSString *)kCGWindowBounds],&fixtureRect);
    BOOL front=NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier==getpid();
    BOOL full=(self.window.styleMask&NSWindowStyleMaskFullScreen)!=0;
    BOOL above=pet&&fixture&&petIndex<fixtureIndex&&CGRectIntersectsRect(petRect,fixtureRect)&&[pet[(__bridge NSString *)kCGWindowAlpha] doubleValue]>.9;
    self.samples++;self.consecutive=front&&full&&above?self.consecutive+1:0;
    self.lastSample=@{@"fullscreen":@(full),@"entered":@(self.entered),@"active":@(front),@"serverOnscreen":@(pet!=nil),@"fixtureOnscreen":@(fixture!=nil),@"serverAboveFixture":@(above),@"consecutive":@(self.consecutive),@"samples":@(self.samples)};
    if(self.consecutive>=3||self.samples>=60)[self finishSample];
}
- (void)finishSample {
    [self.sampler invalidate];self.sampler=nil;
    NSDictionary *value=self.lastSample?:@{@"entered":@(self.entered),@"fullscreen":@NO,@"active":@NO,@"samples":@0};
    NSArray *args=NSProcessInfo.processInfo.arguments;NSUInteger index=[args indexOfObject:@"--result"];
    if(index!=NSNotFound&&index+1<args.count){NSData *bytes=[NSJSONSerialization dataWithJSONObject:value options:0 error:NULL];[bytes writeToFile:args[index+1] atomically:YES];}
    [NSApp terminate:nil];
}
@end
int main(void){@autoreleasepool{NSApplication *app=NSApplication.sharedApplication;[app setActivationPolicy:NSApplicationActivationPolicyRegular];OverlayFixture *delegate=[OverlayFixture new];app.delegate=delegate;[app run];}return 0;}
